import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClickDataDto } from './dto/clickHandlePrepare-dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClickWebhookService {
  private readonly logger = new Logger(ClickWebhookService.name);

  constructor(private readonly prisma: PrismaService, private readonly configService: ConfigService) { }

  /** ───────────────────────────────────────────────────────────────
   *  Tenant-based config loader
   *  ─────────────────────────────────────────────────────────────── */
  private getTenantConfig(tenantId: string) {
    this.logger.log(`[CONFIG] Getting Click config for tenant: ${tenantId}`);

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
      this.logger.error(`[CONFIG] No config found for tenant: ${tenantId}`);
      throw new Error(`Click config not found for tenant: ${tenantId}`);
    }

    this.logger.log(`[CONFIG] Loaded config for tenant: ${tenantId}`);
    return config;
  }

  /** ───────────────────────────────────────────────────────────────
   *  Signature verification
   *  ─────────────────────────────────────────────────────────────── */
  private verifySignature(params: ClickDataDto, secretKey: string) {
    const generated = this.generateSignature(params, secretKey).toLowerCase();
    const isValid = generated === params.sign_string!.toLowerCase();

    this.logger.log(`[SIGNATURE] Verification: ${isValid ? 'VALID' : 'INVALID'}`);
    if (!isValid)
      this.logger.warn(`[SIGNATURE] Expected: ${generated}, Got: ${params.sign_string}`);

    return isValid;
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

    const hash = crypto.createHash('md5').update(signString).digest('hex');
    this.logger.debug(`[SIGNATURE] Generated: ${hash} from: ${signString}`);
    return hash;
  }

  /** ───────────────────────────────────────────────────────────────
   *  HANDLE PREPARE
   *  ─────────────────────────────────────────────────────────────── */
  async handlePrepare(clickData: ClickDataDto) {
    const { click_trans_id, service_id, merchant_trans_id, amount, action, sign_time } = clickData;
    this.logger.log(`[PREPARE] Started. MerchantTransId: ${merchant_trans_id}, Amount: ${amount}`);

    try {
      const tenantId = this.configService.get("TENANT_ID")
      if (!tenantId) throw new Error('TENANT_ID not configured');
      const config = this.getTenantConfig(tenantId);

      if (!this.verifySignature(clickData, config.secretKey)) {
        this.logger.warn(`[PREPARE] Invalid signature for MerchantTransId: ${merchant_trans_id}`);
        return { click_trans_id, merchant_trans_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }

      let transaction = await this.prisma.transaction.findFirst({
        where: { transactionId: merchant_trans_id, status: 'PENDING' },
      });

      let isDaily = false;

      /** Check if related to attendance (daily) */
      if (!transaction) {
        const attendanceId = Number(merchant_trans_id);
        const attendance = await this.prisma.attendance.findUnique({ where: { id: attendanceId } });

        if (attendance) {
          isDaily = true;
          this.logger.log(`[PREPARE] Attendance found. Creating daily transaction...`);

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
            this.logger.warn(`[PREPARE] Already paid today for attendance ID: ${attendance.id}`);
            return { click_trans_id, merchant_trans_id, error: -5, error_note: 'Already paid today' };
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

          this.logger.log(`[PREPARE] Created daily transaction: ${transaction.id}`);
        } else {
          /** Regular (monthly) transaction */
          transaction = await this.prisma.transaction.findFirst({
            where: { transactionId: merchant_trans_id },
          });

          if (transaction?.status === 'PAID') {
            this.logger.warn(`[PREPARE] Already paid transaction: ${merchant_trans_id}`);
            return { click_trans_id, merchant_trans_id, error: -5, error_note: 'Already paid this month' };
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
            this.logger.log(`[PREPARE] Created new transaction: ${transaction.id}`);
          }
        }
      }

      /** Amount mismatch check */
      if (Number(amount) !== Number(transaction.amount.toString())) {
        this.logger.warn(`[PREPARE] Amount mismatch: expected ${transaction.amount}, got ${amount}`);
        return { click_trans_id, merchant_trans_id, error: -2, error_note: 'Incorrect amount' };
      }

      /** Check for duplicate Click transaction */
      const existingClick = await this.prisma.clickTransaction.findUnique({
        where: { clickTransId: click_trans_id },
      });
      if (existingClick) {
        this.logger.warn(`[PREPARE] Duplicate Click transaction: ${click_trans_id}`);
        return { click_trans_id, merchant_trans_id, error: -4, error_note: 'Duplicate transaction' };
      }

      /** Create Click transaction */
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

      this.logger.log(`[PREPARE] Success. MerchantPrepareId: ${merchant_prepare_id}`);
      return {
        click_trans_id,
        merchant_trans_id,
        merchant_prepare_id,
        error: 0,
        error_note: 'Success',
        sign_string: responseSignature,
      };
    } catch (err) {
      this.logger.error('[PREPARE] System error', err);
      return { click_trans_id, merchant_trans_id, error: -8, error_note: 'System error' };
    }
  }

  /** ───────────────────────────────────────────────────────────────
   *  HANDLE COMPLETE
   *  ─────────────────────────────────────────────────────────────── */
  async handleComplete(clickData: ClickDataDto) {
    const { click_trans_id, service_id, merchant_trans_id, merchant_prepare_id, amount, action, sign_time, error } =
      clickData;

    this.logger.log(`[COMPLETE] Started. MerchantTransId: ${merchant_trans_id}, PrepareId: ${merchant_prepare_id}`);

    try {
      const tenantId = this.configService.get("TENANT_ID");
      if (!tenantId) throw new Error('TENANT_ID not configured');
      const config = this.getTenantConfig(tenantId);

      if (!this.verifySignature(clickData, config.secretKey)) {
        this.logger.warn(`[COMPLETE] Invalid signature for MerchantTransId: ${merchant_trans_id}`);
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -1, error_note: 'SIGN CHECK FAILED' };
      }

      const prepareTransaction = await this.prisma.clickTransaction.findUnique({
        where: { id: Number(merchant_prepare_id) },
      });

      if (!prepareTransaction) {
        this.logger.warn(`[COMPLETE] Prepare transaction not found: ${merchant_prepare_id}`);
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -6, error_note: 'Transaction not found' };
      }

      if (prepareTransaction.status === 1) {
        this.logger.warn(`[COMPLETE] Transaction already marked as PAID`);
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -4, error_note: 'Already paid' };
      }

      if (error && error < 0) {
        this.logger.warn(`[COMPLETE] Payment cancelled by Click. Error code: ${error}`);
        await this.prisma.clickTransaction.update({
          where: { id: Number(merchant_prepare_id) },
          data: { status: -1, error, errorNote: 'Payment cancelled' },
        });
        return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: 0, error_note: 'Success' };
      }

      /** Fetch merchant transaction */
      let transaction = await this.prisma.transaction.findUnique({
        where: { transactionId: merchant_trans_id },
      });

      if (!transaction) {
        const attendanceId = Number(merchant_trans_id);
        this.logger.log(`[COMPLETE] No transaction found, marking attendance ID ${attendanceId} as PAID`);
        await this.prisma.attendance.update({
          where: { id: attendanceId },
          data: { status: 'PAID' },
        });
      } else {
        this.logger.log(`[COMPLETE] Updating transaction ID ${transaction.id} to PAID`);
        transaction = await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'PAID', paymentMethod: 'CLICK' },
        });

        if (transaction.attendanceId) {
          this.logger.log(`[COMPLETE] Updating attendance ID ${transaction.attendanceId} to PAID`);
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

      this.logger.log(`[COMPLETE] Success. Transaction finalized.`);
      return {
        click_trans_id,
        merchant_trans_id,
        merchant_confirm_id: prepareTransaction.id,
        error: 0,
        error_note: 'Success',
        sign_string: responseSignature,
      };
    } catch (err) {
      this.logger.error('[COMPLETE] System error', err);
      return { click_trans_id, merchant_trans_id, merchant_prepare_id, error: -8, error_note: 'System error' };
    }
  }
}
