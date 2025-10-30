import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClickDataDto } from './dto/clickHandlePrepare-dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * ClickWebhookService — Handles Click payment system “prepare” and “complete” callbacks.
 *
 * Reference: https://docs.click.uz
 *
 * Workflow:
 *  1️⃣  Prepare stage — verify signature, create pending transaction, return merchant_prepare_id.
 *  2️⃣  Complete stage — verify signature again, mark transaction as PAID, return merchant_confirm_id.
 */
@Injectable()
export class ClickWebhookService {
  private readonly logger = new Logger(ClickWebhookService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Get Click merchant credentials per tenant.
   */
  private getTenantConfig(tenantId: string) {
    this.logger.log(`[CONFIG] Getting Click config for tenant: ${tenantId}`);

    const configs: Record<
      string,
      { serviceId: string; merchantId: string; secretKey: string }
    > = {
      rizq_baraka: {
        serviceId: '84321',
        merchantId: '46942',
        secretKey: 'p1oJkGcWDlLW8a4',
      },
      muzaffar_savdo: {
        serviceId: '84319',
        merchantId: '46941',
        secretKey: '2vzlHCCdCiPxe',
      },
      istiqlol: {
        serviceId: '84310',
        merchantId: '46933',
        secretKey: '04uTwJvDT56NU',
      },
      bogdod: {
        serviceId: '84296',
        merchantId: '46927',
        secretKey: 'Oq0fcQlqniz',
      },
      beshariq_turon: {
        serviceId: '84316',
        merchantId: '46938',
        secretKey: '3f1RCN3QJvSVR',
      },
      beshariq: {
        serviceId: '84272',
        merchantId: '46913',
        secretKey: 'OFuFke5FvD3Bg',
      },
    };

    const config = configs[tenantId];
    if (!config) {
      this.logger.error(`[CONFIG] No config found for tenant: ${tenantId}`);
      throw new Error(`Click config not found for tenant: ${tenantId}`);
    }

    this.logger.log(`[CONFIG] Loaded config for tenant: ${tenantId}`);
    return config;
  }

  /**
   * Generate signature for Click API verification.
   */
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

    const hash = crypto.createHash('md5').update(signString).digest('hex');
    this.logger.debug(`[SIGNATURE] Generated: ${hash} from: ${signString}`);
    return hash;
  }

  /**
   * Verify incoming Click signature.
   */
  private verifySignature(params: ClickDataDto, secretKey: string): boolean {
    const generated = this.generateSignature(params, secretKey);
    const isValid =
      generated.toLowerCase() === params?.sign_string?.toLowerCase();

    this.logger.log(`[SIGNATURE] Verification: ${isValid ? 'VALID' : 'INVALID'}`);
    if (!isValid) {
      this.logger.warn(
        `[SIGNATURE] Expected: ${generated}, Got: ${params.sign_string}`,
      );
    }

    return isValid;
  }

  /**
   * Handle Click Prepare (action=0)
   */
  async handlePrepare(clickData: ClickDataDto) {
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
      `[PREPARE] Started. MerchantTransId: ${merchant_trans_id}, Amount: ${amount}`,
    );

    try {
      const tenantId = process.env.TENANT_ID!;
      const config = this.getTenantConfig(tenantId);

      // 1️⃣ Signature verification
      if (!this.verifySignature(clickData, config.secretKey)) {
        return {
          click_trans_id,
          merchant_trans_id,
          error: -1,
          error_note: 'SIGN CHECK FAILED',
        };
      }

      // 2️⃣ Find or create transaction
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

          // Prevent double daily payment
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);

          const existingDaily = await this.prisma.transaction.findFirst({
            where: {
              attendanceId: attendance.id,
              status: 'PAID',
              createdAt: { gte: todayStart, lte: todayEnd },
            },
          });

          if (existingDaily) {
            return {
              click_trans_id,
              merchant_trans_id,
              error: -5,
              error_note: 'Already paid today',
            };
          }

          // Create new daily transaction
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
          const existing = await this.prisma.transaction.findFirst({
            where: { transactionId: merchant_trans_id },
          });

          if (existing && existing.status === 'PAID') {
            return {
              click_trans_id,
              merchant_trans_id,
              error: -5,
              error_note: 'Already paid',
            };
          }

          if (!existing) {
            transaction = await this.prisma.transaction.create({
              data: {
                transactionId: merchant_trans_id,
                amount: new Prisma.Decimal(amount),
                status: 'PENDING',
                paymentMethod: 'CLICK',
              },
            });
          } else {
            transaction = existing;
          }
        }
      }

      // 3️⃣ Amount check
      if (Number(amount) !== Number(transaction.amount.toString())) {
        return {
          click_trans_id,
          merchant_trans_id,
          error: -2,
          error_note: 'Incorrect amount',
        };
      }

      // 4️⃣ Prevent duplicate click transaction
      const existingClick = await this.prisma.clickTransaction.findUnique({
        where: { clickTransId: click_trans_id },
      });
      if (existingClick) {
        return {
          click_trans_id,
          merchant_trans_id,
          error: -4,
          error_note: 'Duplicate transaction',
        };
      }

      // 5️⃣ Create Click transaction record
      const clickTransaction = await this.prisma.clickTransaction.create({
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

      const merchant_prepare_id = clickTransaction.id.toString();

      // 6️⃣ Generate response signature
      const responseSignature = this.generateSignature(
        {
          click_trans_id,
          service_id,
          merchant_trans_id,
          merchant_prepare_id,
          amount,
          action,
          sign_time,
        },
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
      this.logger.error('[PREPARE] System error', err);
      return {
        click_trans_id: clickData.click_trans_id,
        merchant_trans_id: clickData.merchant_trans_id,
        error: -8,
        error_note: 'System error',
      };
    }
  }

  /**
   * Handle Click Complete (action=1)
   */
  async handleComplete(clickData: ClickDataDto) {
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
      `[COMPLETE] Started. MerchantTransId: ${merchant_trans_id}, PrepareId: ${merchant_prepare_id}`,
    );

    try {
      const tenantId = process.env.TENANT_ID!;
      const config = this.getTenantConfig(tenantId);

      // 1️⃣ Signature check
      if (!this.verifySignature(clickData, config.secretKey)) {
        return {
          click_trans_id,
          merchant_trans_id,
          merchant_prepare_id,
          error: -1,
          error_note: 'SIGN CHECK FAILED',
        };
      }

      // 2️⃣ Get prepare record
      const prepareTransaction = await this.prisma.clickTransaction.findUnique({
        where: { id: Number(merchant_prepare_id) },
      });

      if (!prepareTransaction) {
        return {
          click_trans_id,
          merchant_trans_id,
          merchant_prepare_id,
          error: -6,
          error_note: 'Transaction not found',
        };
      }

      // 3️⃣ If Click canceled payment
      if (error === -9) {
        await this.prisma.clickTransaction.update({
          where: { id: Number(merchant_prepare_id) },
          data: { status: -1, error, errorNote: 'Cancelled by Click' },
        });
        return {
          click_trans_id,
          merchant_trans_id,
          merchant_prepare_id,
          error: 0,
          error_note: 'Success',
        };
      }

      // 4️⃣ If already paid
      if (prepareTransaction.status === 1) {
        return {
          click_trans_id,
          merchant_trans_id,
          merchant_prepare_id,
          error: -4,
          error_note: 'Already paid',
        };
      }

      // 5️⃣ Mark merchant transaction or attendance as PAID
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

      // 6️⃣ Mark Click transaction as PAID
      await this.prisma.clickTransaction.update({
        where: { id: Number(merchant_prepare_id) },
        data: { status: 1, clickPaydocId: click_paydoc_id },
      });

      // 7️⃣ Response
      const responseSignature = this.generateSignature(
        {
          click_trans_id,
          service_id,
          merchant_trans_id,
          merchant_prepare_id,
          amount,
          action,
          sign_time,
        },
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
      this.logger.error('[COMPLETE] System error', err);
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
