import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClickWebhookService {
  private readonly logger = new Logger(ClickWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }


  private getTenantConfig(tenantId: string) {
    this.logger.log(`[CONFIG] Loading Click config for tenant=${tenantId}`);

    const configs: Record<string, { serviceId: string; merchantId: string; secretKey: string }> = {
      rizq_baraka: { serviceId: '84321', merchantId: '46942', secretKey: 'p1oJkGcWDlLW8a4' },
      muzaffar_savdo: { serviceId: '84319', merchantId: '46941', secretKey: '2vzlHCCdCiPxe' },
      istiqlol: { serviceId: '84310', merchantId: '46933', secretKey: '04uTwJvDT56NU' },
      bogdod: { serviceId: '84296', merchantId: '46927', secretKey: 'Oq0fcQlqniz' },
      beshariq_turon: { serviceId: '84316', merchantId: '46938', secretKey: '3f1RCN3QJvSVR' },
      beshariq: { serviceId: '84272', merchantId: '46913', secretKey: 'OFuFke5FvD3Bg' },
    };

    const config = configs[tenantId];
    if (!config) {
      this.logger.error(`[CONFIG] No Click config for tenant=${tenantId}`);
      throw new Error(`Click config not found for tenant: ${tenantId}`);
    }
    return config;
  }

  private generateSignature(params: any, secretKey: string): string {


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

  private verifySignature(params: any, secretKey: string): boolean {
    const expected = this.generateSignature(params, secretKey).toLowerCase();
    const provided = (params.sign_string || '').toLowerCase();
    const ok = expected === provided;
    this.logger.debug(`[SIGN] expected=${expected} provided=${provided} ok=${ok}`);
    return ok;
  }

  /**
   * Prepare handler (action = 0)
   * Returns shape:
   * { click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note, sign_string? }
   */
  async handlePrepare(clickData: any) {
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      click_paydoc_id,
      amount,
      action,
      sign_time,
    } = clickData;

    this.logger.log(
      `[PREPARE] received click_trans=${click_trans_id} merchant_trans=${merchant_trans_id} amount=${amount}`,
    );

    try {
      const tenantId = this.configService.get<string>('TENANT_ID');
      if (!tenantId) throw new Error('TENANT_ID not configured');

      const cfg = this.getTenantConfig(tenantId);


      if (!this.verifySignature(clickData, cfg.secretKey)) {
        this.logger.warn('[PREPARE] signature invalid');
        return { click_trans_id, merchant_trans_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }

      let transaction: any;
      let isDaily = false;


      const store = await this.prisma.store.findFirst({
        where: { storeNumber: merchant_trans_id },
        include: { contracts: true },
      });
      console.log(store)
      console.log(await this.prisma.store.findFirst({
        where: { storeNumber: merchant_trans_id },
        include: { contracts: true },
      }))

      if (store) {

        const contract =
          store.contracts?.find((c: any) => c.isActive) ??
          store.contracts?.[0];
        console.log(contract)

        if (!contract || !contract.isActive) {

          return {
            click_trans_id,
            merchant_trans_id,
            error: -6,
            error_note: 'Store has no contract or there is no active contract for this store',
          };
        }


        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(startOfMonth.getMonth() + 1);
        endOfMonth.setMilliseconds(-1);

        const existingMonthly = await this.prisma.transaction.findFirst({
          where: {
            contractId: contract.id,
            status: 'PAID',
            createdAt: { gte: startOfMonth, lte: endOfMonth },
          },
        });

        if (existingMonthly) {
          return {
            click_trans_id,
            merchant_trans_id,
            error: -5,
            error_note: 'Already paid for this month',
          };
        }


        transaction = await this.prisma.transaction.create({
          data: {
            transactionId: String(store.storeNumber),
            amount: new Prisma.Decimal(amount),
            status: 'PENDING',
            paymentMethod: 'CLICK',
            contract: { connect: { id: contract.id } },
          },
        });
      } else {

        const attendanceId = Number(merchant_trans_id);
        if (isNaN(attendanceId)) {
          return { click_trans_id, merchant_trans_id, error: -6, error_note: 'Store or attendance not found' };
        }

        const attendance = await this.prisma.attendance.findUnique({ where: { id: attendanceId } });
        if (!attendance) {
          return { click_trans_id, merchant_trans_id, error: -6, error_note: 'Store or attendance not found' };
        }

        isDaily = true;


        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const existingDaily = await this.prisma.transaction.findFirst({
          where: { attendanceId: attendance.id, status: 'PAID', createdAt: { gte: todayStart, lte: todayEnd } },
        });

        if (existingDaily) {
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
            amount: attendance.amount ?? new Prisma.Decimal(amount),
            status: 'PENDING',
            paymentMethod: 'CLICK',
            attendance: { connect: { id: attendance.id } },
          },
        });
      }


      if (Number(amount) !== Number(transaction.amount.toString())) {
        this.logger.warn('[PREPARE] amount mismatch', {
          expected: transaction.amount.toString(),
          got: amount,
        });
        return { click_trans_id, merchant_trans_id, error: -2, error_note: 'Incorrect amount' };
      }


      const existingClick = await this.prisma.clickTransaction.findUnique({
        where: { clickTransId: click_trans_id },
      });
      if (existingClick) {
        return { click_trans_id, merchant_trans_id, error: -4, error_note: 'Duplicate transaction' };
      }


      const clickTx = await this.prisma.clickTransaction.create({
        data: {
          clickTransId: click_trans_id,
          clickPaydocId: click_paydoc_id,
          merchantTransId: merchant_trans_id,
          amount: new Prisma.Decimal(amount),
          action: Number(action),
          signTime: new Date(sign_time),
          status: 0,
          error: 0,
        },
      });

      const merchant_prepare_id = clickTx.id.toString();

      const signForResponse = this.generateSignature(
        { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time },
        cfg.secretKey,
      );

      return {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        error: 0,
        error_note: 'Success',
        sign_string: signForResponse,
      };
    } catch (err) {
      this.logger.error('[PREPARE] error', err);
      return {
        click_trans_id: clickData.click_trans_id,
        merchant_trans_id: clickData.merchant_trans_id,
        error: -8,
        error_note: 'System error',
      };
    }
  }

  /**
   * Complete handler (action = 1)
   * Returns shape:
   * { click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note, sign_string? }
   */
  async handleComplete(clickData: any) {
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      merchant_prepare_id,
      click_paydoc_id,
      amount,
      action,
      sign_time,
      error,
    } = clickData;

    this.logger.log(
      `[COMPLETE] received click_trans=${click_trans_id} merchant=${merchant_trans_id} prepare=${merchant_prepare_id}`,
    );

    try {
      const tenantId = this.configService.get<string>('TENANT_ID');
      if (!tenantId) throw new Error('TENANT_ID not configured');

      const cfg = this.getTenantConfig(tenantId);

      if (!this.verifySignature(clickData, cfg.secretKey)) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }

      const prepareTx = await this.prisma.clickTransaction.findUnique({ where: { id: Number(merchant_prepare_id) } });
      if (!prepareTx) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -6, error_note: 'Transaction not found' };
      }


      if (error !== undefined && error < 0) {
        await this.prisma.clickTransaction.update({
          where: { id: Number(merchant_prepare_id) },
          data: { status: -1, error, errorNote: 'Cancelled by Click' },
        });
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: 0, error_note: 'Success' };
      }

      if (prepareTx.status === 1) {
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -4, error_note: 'Already paid' };
      }


      let transaction = await this.prisma.transaction.findUnique({ where: { transactionId: merchant_trans_id } });

      if (!transaction) {

        const attendanceId = Number(merchant_trans_id);
        if (!isNaN(attendanceId)) {

          await this.prisma.attendance.update({ where: { id: attendanceId }, data: { status: 'PAID' } });
        } else {

          this.logger.warn('[COMPLETE] transaction not found and merchant_trans is not an attendance id', { merchant_trans_id });
        }
      } else {

        transaction = await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'PAID', paymentMethod: 'CLICK' },
        });


        if (transaction.attendanceId) {
          await this.prisma.attendance.update({ where: { id: transaction.attendanceId }, data: { status: 'PAID' } });
        }
      }


      await this.prisma.clickTransaction.update({
        where: { id: Number(merchant_prepare_id) },
        data: { status: 1, clickPaydocId: click_paydoc_id },
      });

      const signForResp = this.generateSignature(
        { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time },
        cfg.secretKey,
      );

      return { click_trans_id, merchant_trans_id, merchant_confirm_id: prepareTx.id, error: 0, error_note: 'Success', sign_string: signForResp };
    } catch (err) {
      this.logger.error('[COMPLETE] error', err);
      return {
        click_trans_id: clickData.click_trans_id,
        merchant_trans_id: clickData.merchant_trans_id,
        merchant_prepare_id: clickData.merchant_prepare_id,
        error: -8,
        error_note: 'System error',
      };
    }
  }
}
