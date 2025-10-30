import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClickDataDto } from './dto/clickHandlePrepare-dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class ClickWebhookService {
  private readonly logger = new Logger(ClickWebhookService.name);

  constructor(private readonly prisma: PrismaService) { }

  private getTenantConfig(tenantId: string) {
    const configs: Record<string, { serviceId: string; merchantId: string; secretKey: string }> = {
      rizq_baraka: { serviceId: '84321', merchantId: '46942', secretKey: 'p1oJkGcWDlLW8a4' },
      muzaffar_savdo: { serviceId: '84319', merchantId: '46941', secretKey: '2vzlHCCdCiPxe' },
      istiqlol: { serviceId: '84310', merchantId: '46933', secretKey: '04uTwJvDT56NU' },
      bogdod: { serviceId: '84296', merchantId: '46927', secretKey: 'Oq0fcQlqniz' },
      beshariq_turon: { serviceId: '84316', merchantId: '46938', secretKey: '3f1RCN3QJvSVR' },
      beshariq: { serviceId: '84272', merchantId: '46913', secretKey: 'OFuFke5FvD3Bg' },
    };

    const config = configs[tenantId];
    if (!config) throw new Error(`Click config not found for tenant: ${tenantId}`);
    return config;
  }

  private verifySignature(params: ClickDataDto, secretKey: string) {
    const hash = this.generateSignature(params, secretKey);
    return hash === params.sign_string;
  }

  private generateSignature(params: any, secretKey: string) {
    const signString =
      params.click_trans_id +
      params.service_id +
      secretKey +
      params.merchant_trans_id +
      (params.merchant_prepare_id || '') +
      params.amount +
      params.action +
      params.sign_time;

    return crypto.createHash('md5').update(signString).digest('hex');
  }


  async handlePrepare(clickData: ClickDataDto) {
    const { click_trans_id, service_id, merchant_trans_id, amount, action, sign_time } = clickData;

    try {
      const tenantId = process.env.TENANT_ID!;
      const config = this.getTenantConfig(tenantId);

      if (!this.verifySignature(clickData, config.secretKey)) {
        return { click_trans_id, merchant_trans_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }


      let transaction = await this.prisma.transaction.findFirst({
        where: { transactionId: merchant_trans_id, status: 'PENDING' },
      });

      let isDaily = false;

      if (!transaction) {
        const attendanceId = Number(merchant_trans_id);
        const attendance = await this.prisma.attendance.findUnique({
          where: { id: attendanceId },
        });

        if (attendance) {
          isDaily = true;

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const existingDailyPayment = await this.prisma.transaction.findFirst({
            where: {
              attendanceId: attendance.id,
              status: 'PAID',
              createdAt: { gte: todayStart, lte: todayEnd },
            },
          });

          if (existingDailyPayment) {
            return {
              click_trans_id,
              merchant_trans_id,
              error: -5,
              error_note: 'Already paid today',
            };
          }


          transaction = await this.prisma.transaction.create({
            data: {
              transactionId: String(attendance.id),
              amount: attendance.amount || new Prisma.Decimal(0),
              status: 'PENDING',
              paymentMethod: 'CLICK',
              attendance: { connect: { id: attendance.id } },
            },
          });
        } else {

          transaction = await this.prisma.transaction.findFirst({
            where: { transactionId: merchant_trans_id },
          });

          if (transaction && transaction.status === 'PAID') {
            return {
              click_trans_id,
              merchant_trans_id,
              error: -5,
              error_note: 'Already paid this month',
            };
          }

          if (!transaction) {
            transaction = await this.prisma.transaction.create({
              data: {
                transactionId: merchant_trans_id,
                amount: new Prisma.Decimal(amount),
                status: 'PENDING',
                paymentMethod: 'CLICK',
              },
            });
          }
        }
      }

      if (Number(amount) !== Number(transaction.amount.toString())) {
        return { click_trans_id, merchant_trans_id, error: -2, error_note: 'Incorrect amount' };
      }


      const existingClick = await this.prisma.clickTransaction.findUnique({
        where: { clickTransId: click_trans_id },
      });
      if (existingClick) return { click_trans_id, merchant_trans_id, error: -4, error_note: 'Duplicate transaction' };

      const clickTransaction = await this.prisma.clickTransaction.create({
        data: {
          clickTransId: click_trans_id,
          merchantTransId: merchant_trans_id,
          amount: new Prisma.Decimal(amount),
          action: Number(action),
          signTime: new Date(sign_time),
          status: 0,
          error: 0,
        },
      });

      const merchant_prepare_id = clickTransaction.id.toString();
      const responseSignature = this.generateSignature(
        { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time },
        config.secretKey,
      );

      return {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        error: 0,
        error_note: 'Success',
        sign_string: responseSignature,
      };
    } catch (err) {
      this.logger.error('PREPARE failed', err);
      return { click_trans_id, merchant_trans_id, error: -8, error_note: 'System error' };
    }
  }

  async handleComplete(clickData: ClickDataDto) {
    const { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time, error } = clickData;

    try {
      const tenantId = process.env.TENANT_ID!;
      const config = this.getTenantConfig(tenantId);

      if (!this.verifySignature(clickData, config.secretKey)) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }

      const prepareTransaction = await this.prisma.clickTransaction.findUnique({
        where: { id: Number(merchant_prepare_id) },
      });

      if (!prepareTransaction) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -6, error_note: 'Transaction not found' };
      }

      if (prepareTransaction.status === 1) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -4, error_note: 'Already paid' };
      }

      if (error && error < 0) {
        await this.prisma.clickTransaction.update({
          where: { id: Number(merchant_prepare_id) },
          data: { status: -1, error, errorNote: 'Payment cancelled' },
        });
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: 0, error_note: 'Success' };
      }

      let transaction = await this.prisma.transaction.findUnique({
        where: { transactionId: merchant_trans_id },
      });

      if (!transaction) {

        const attendanceId = Number(merchant_trans_id);
        await this.prisma.attendance.update({
          where: { id: attendanceId },
          data: { status: 'PAID' },
        });
      } else {

        transaction = await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'PAID', paymentMethod: 'CLICK' },
        });
        if (transaction.attendanceId) {
          await this.prisma.attendance.update({
            where: { id: transaction.attendanceId },
            data: { status: 'PAID' },
          });
        }
      }

      await this.prisma.clickTransaction.update({
        where: { id: Number(merchant_prepare_id) },
        data: { status: 1 },
      });

      const responseSignature = this.generateSignature(
        { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time },
        config.secretKey,
      );

      return {
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: prepareTransaction.id,
        error: 0,
        error_note: 'Success',
        sign_string: responseSignature,
      };
    } catch (err) {
      this.logger.error('COMPLETE failed', err);
      return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -8, error_note: 'System error' };
    }
  }
}
