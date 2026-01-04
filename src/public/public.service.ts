import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GetContractsDto } from './dto/contracts.dto';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { GetStallDto } from './dto/getPayInfo.dto';
import * as base64 from 'base-64';
import { ContractPaymentPeriodsService } from '../contract/contract-payment.service';
dayjs.extend(isBetween);

function normalizeStoreNumber(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.normalize('NFKC').trim();
  return normalized || undefined;
}

function normalizeTin(value?: string): string | undefined {
  if (!value) return undefined;
  const digitsOnly = value.replace(/\D+/g, '');
  return digitsOnly || undefined;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contractPayments: ContractPaymentPeriodsService,
  ) { }

  private getConfigValue(...keys: string[]): string | null {
    for (const key of keys) {
      if (!key) continue;
      const value = this.config.get<string>(key) ?? process.env[key];
      if (typeof value === 'string' && value.trim().length) {
        return value.trim();
      }
    }
    return null;
  }

  private normalizeAmount(amount?: Prisma.Decimal | number | string | null) {
    if (amount === null || amount === undefined) return null;
    if (amount instanceof Prisma.Decimal) return amount.toString();
    if (typeof amount === 'number' && !Number.isNaN(amount)) return amount.toString();
    if (typeof amount === 'string') {
      const trimmed = amount.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return null;
      return parsed.toString();
    }
    return null;
  }

  private buildClickPaymentUrl(amount: string | null, reference: string | number) {
    if (!amount) return null;
    const serviceId = this.getConfigValue('PAYMENT_SERVICE_ID', 'CLICK_SERVICE_ID');
    const merchantId = this.getConfigValue('PAYMENT_MERCHANT_ID', 'CLICK_MERCHANT_ID');
    if (!serviceId || !merchantId) return null;
    return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${reference}`;
  }

  private buildPaymePaymentUrl(amount: string | null, contractReference: string | number) {
    if (!amount || this.config.get<string>('TENANT_ID') !== 'ipak_yuli') return null;

    const merchantId = this.getConfigValue('PAYME_MERCHANT_ID');
    if (!merchantId) return null;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) return null;
    const amountInTiyin = Math.round(parsedAmount * 100);
    if (!amountInTiyin) return null;

    const params = `m=${merchantId};ac.contractId=${contractReference};ac.id=1;ac.attendanceId=null;a=${amountInTiyin};c=https://myrent.uz/contracts`;
    const latinPayload = Buffer.from(params, 'utf8').toString('latin1');
    const encoded = base64.encode(latinPayload);
    return `https://checkout.paycom.uz/${encoded}`;
  }

  private buildAttendancePaymeUrl(amount: string | null, attendanceId: number) {
    if (!amount || this.config.get<string>('TENANT_ID') !== 'ipak_yuli') return null;

    const merchantId = this.getConfigValue('PAYME_MERCHANT_ID');
    if (!merchantId) return null;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) return null;
    const amountInTiyin = Math.round(parsedAmount * 100);
    if (!amountInTiyin) return null;

    const params = `m=${merchantId};ac.id=1;ac.attendanceId=${attendanceId};ac.contractId=null;a=${amountInTiyin};c=https://myrent.uz/attendances`;
    const latinPayload = Buffer.from(params, 'utf8').toString('latin1');
    const encoded = base64.encode(latinPayload);
    return `https://checkout.paycom.uz/${encoded}`;
  }

  private buildAttendancePaymentInfo(attendance: any) {
    if (!attendance) return null;
    const amountString = this.normalizeAmount(attendance.amount);
    const amount = amountString ? Number(amountString) : null;
    const clickUrl = this.buildClickPaymentUrl(amountString, attendance.id);
    const paymeUrl = this.buildAttendancePaymeUrl(amountString, attendance.id);

    const status =
      attendance.status === 'PAID' ||
      attendance.transaction?.status === 'PAID'
        ? 'PAID'
        : attendance.status || 'UNPAID';

    return {
      amount,
      currency: amount ? 'UZS' : null,
      status,
      date: dayjs(attendance.date).format('YYYY-MM-DD'),
      urls: {
        click: clickUrl,
        payme: paymeUrl,
      },
      paymentUrl: paymeUrl || clickUrl || null,
    };
  }

  private hasValidPaymeUrl(url?: string | null) {
    if (!url) return false;
    if (!url.startsWith('https://checkout.paycom.uz/')) return false;
    const payload = url.replace('https://checkout.paycom.uz/', '');
    return payload.length > 0 && /^[A-Za-z0-9+/=]+$/.test(payload);
  }

  private async ensureStorePaymentLinks(contract: any) {
    if (!contract?.store) return contract;

    const amount = this.normalizeAmount(contract.shopMonthlyFee);
    const storeNumber = contract.store.storeNumber ?? contract.storeId;

    if (!amount || !storeNumber) return contract;

    const needsClick = !contract.store.click_payment_url;
    const needsPayme =
      this.config.get<string>('TENANT_ID') === 'ipak_yuli' &&
      !this.hasValidPaymeUrl(contract.store.payme_payment_url);

    if (!needsClick && !needsPayme) return contract;

    const updateData: Record<string, string> = {};

    if (needsClick) {
      const clickUrl = this.buildClickPaymentUrl(amount, storeNumber);
      if (clickUrl) updateData.click_payment_url = clickUrl;
    }

    if (needsPayme) {
      const paymeUrl = this.buildPaymePaymentUrl(amount, storeNumber);
      if (paymeUrl) updateData.payme_payment_url = paymeUrl;
    }

    if (Object.keys(updateData).length) {
      const updatedStore = await this.prisma.store.update({
        where: { id: contract.storeId },
        data: updateData,
      });
      contract.store = updatedStore;
    }

    return contract;
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private buildContractPaymentInfo(contract: any, hasCurrentPeriodPaid: boolean) {
    const amountString = this.normalizeAmount(contract.shopMonthlyFee);
    const amount = amountString ? Number(amountString) : null;
    const currency = amount ? 'UZS' : null;

    const startOfMonth = dayjs().startOf('month');
    const endOfMonth = dayjs().endOf('month');

    const paid = !!hasCurrentPeriodPaid;

    const tenantId = this.config.get<string>('TENANT_ID');
    const paymentUrl =
      tenantId === 'ipak_yuli'
        ? (contract.store?.payme_payment_url ?? null)
        : (contract.store?.click_payment_url ?? contract.store?.payme_payment_url ?? null);

    return {
      amount,
      currency,
      paid,
      paymentUrl,
      dueDate: endOfMonth.toISOString(),
      periodLabel: dayjs().format('MMMM YYYY'),
    };
  }

  async contract(query: GetContractsDto) {
    const normalizedStoreNumber = normalizeStoreNumber(query.storeNumber);
    const normalizedTin = normalizeTin(query.tin);
    const fields = query.fields;

    if (!normalizedStoreNumber && !normalizedTin) {
      throw new BadRequestException(
        'At least one parameter (storeNumber or tin) must be provided',
      );
    }


    const where: Prisma.ContractWhereInput = { isActive: true };
    if (normalizedStoreNumber) {
      const storeFilters: Prisma.StoreWhereInput = {
        OR: [
          {
            storeNumber: {
              equals: normalizedStoreNumber,
              mode: 'insensitive',
            },
          },
          {
            storeNumber: {
              contains: normalizedStoreNumber,
              mode: 'insensitive',
            },
          },
        ],
      };

      const compact = normalizedStoreNumber.replace(/[\s\-_.]/g, '');
      if (compact && compact !== normalizedStoreNumber) {
        storeFilters.OR?.push({
          storeNumber: {
            contains: compact,
            mode: 'insensitive',
          },
        });
      }

      where.store = {
        is: storeFilters,
      };
    }
    if (normalizedTin)
      where.owner = {
        is: {
          tin: {
            equals: normalizedTin,
            mode: 'insensitive',
          },
        },
      };

    if (fields === 'min') {
      const contracts = await this.prisma.contract.findMany({
        where,
        select: {
          id: true,
          shopMonthlyFee: true,
          issueDate: true,
          createdAt: true,
          expiryDate: true,
          storeId: true,
          store: { select: { storeNumber: true } },
          owner: { select: { fullName: true } },
        },
      });

      if (!contracts.length) {
        return {
          count: 0,
          data: [],
        };
      }

      const snapshots = await this.contractPayments.getSnapshotsForContracts(
        contracts.map((c: any) => ({
          id: c.id,
          issueDate: c.issueDate,
          createdAt: c.createdAt,
          shopMonthlyFee: c.shopMonthlyFee,
        })) as any,
      );

      const periodLabel = dayjs().format('MMMM YYYY');
      const result = contracts.map((contract: any) => {
        const snap = snapshots.get(contract.id);
        const amountString = this.normalizeAmount(contract.shopMonthlyFee);
        const amountDue = amountString ? Number(amountString) : null;
        const isPaid = snap?.hasCurrentPeriodPaid ?? false;
        return {
          id: contract.id,
          storeNumber: contract.store?.storeNumber ?? contract.storeId,
          ownerName: contract.owner?.fullName ?? null,
          periodLabel,
          amountDue,
          currency: amountDue ? 'UZS' : null,
          isPaid,
          status: isPaid ? 'PAID' : 'UNPAID',
        };
      });

      return {
        count: result.length,
        data: result,
      };
    }


    const contracts = await this.prisma.contract.findMany({
      where,
      include: {
        store: true,
        owner: true,
      },
    });

    if (!contracts.length) {
      return {
        count: 0,
        data: [],
      };
    }

    const enrichedContracts = await Promise.all(
      contracts.map((contract) => this.ensureStorePaymentLinks(contract)),
    );

    const snapshots = await this.contractPayments.getSnapshotsForContracts(
      enrichedContracts.map((c: any) => ({
        id: c.id,
        issueDate: c.issueDate,
        createdAt: c.createdAt,
        shopMonthlyFee: c.shopMonthlyFee,
      })) as any,
    );

    const result = enrichedContracts.map((contract: any) => {
      const snap = snapshots.get(contract.id);
      const paymentInfo = this.buildContractPaymentInfo(contract, snap?.hasCurrentPeriodPaid ?? false);
      const rest = contract;
      const expired = contract.expiryDate ? dayjs(contract.expiryDate).isBefore(dayjs(), 'day') : false;
      const normalizedMonthlyFee =
        paymentInfo.amount ?? this.toNumber(rest.shopMonthlyFee) ?? rest.shopMonthlyFee;

      return {
        ...rest,
        shopMonthlyFee: normalizedMonthlyFee,
        paid: paymentInfo.paid,
        expired,
        paymentUrl: paymentInfo.paymentUrl,
        paymentSnapshot: snap
          ? {
              paidThrough: snap.paidThrough,
              nextPeriodStart: snap.nextPeriodStart,
              monthsAhead: snap.monthsAhead,
              hasCurrentPeriodPaid: snap.hasCurrentPeriodPaid,
            }
          : null,
        payment: {
          amountDue: paymentInfo.amount,
          currency: paymentInfo.currency,
          dueDate: paymentInfo.dueDate,
          periodLabel: paymentInfo.periodLabel,
          status: paymentInfo.paid ? 'PAID' : 'UNPAID',
        },
      };
    });

    return {
      count: result.length,
      data: result,
    };
  }

  async getContractDetails(id: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        owner: true,
        store: true,
      },
    });

    if (!contract || contract.isActive === false) {
      throw new NotFoundException(`Contract with id ${id} not found`);
    }

    const enriched = await this.ensureStorePaymentLinks(contract);
    const snapshot = await this.contractPayments.getSnapshotForContract({
      id: enriched.id,
      issueDate: enriched.issueDate,
      createdAt: enriched.createdAt,
      shopMonthlyFee: enriched.shopMonthlyFee,
    } as any);
    const paymentInfo = this.buildContractPaymentInfo(enriched, snapshot?.hasCurrentPeriodPaid ?? false);
    const expired = enriched.expiryDate ? dayjs(enriched.expiryDate).isBefore(dayjs(), 'day') : false;

    const contractPayload = {
      id: enriched.id,
      certificateNumber: enriched.certificateNumber,
      issueDate: enriched.issueDate,
      expiryDate: enriched.expiryDate,
      isActive: enriched.isActive,
      storeId: enriched.storeId,
      ownerId: enriched.ownerId,
      shopMonthlyFee:
        paymentInfo.amount ?? this.toNumber(enriched.shopMonthlyFee),
      paid: paymentInfo.paid,
      expired,
    };

    return {
      contract: contractPayload,
      owner: enriched.owner,
      store: enriched.store,
      paymentSnapshot: snapshot
        ? {
            paidThrough: snapshot.paidThrough,
            nextPeriodStart: snapshot.nextPeriodStart,
            monthsAhead: snapshot.monthsAhead,
            hasCurrentPeriodPaid: snapshot.hasCurrentPeriodPaid,
          }
        : null,
      payment: {
        amountDue: paymentInfo.amount,
        currency: paymentInfo.currency,
        dueDate: paymentInfo.dueDate,
        periodLabel: paymentInfo.periodLabel,
        status: paymentInfo.paid ? 'PAID' : 'UNPAID',
      },
      paymentUrl: paymentInfo.paymentUrl,
    };
  }

  async initiateContractPayment(id: number) {
    const details = await this.getContractDetails(id);
    if (!details.paymentUrl) {
      throw new NotFoundException(
        'Payment link is not configured for this contract',
      );
    }

    return details;
  }

  async getStallStatus(query: GetStallDto) {
    const { id, date, fields } = query;

    if (!id) {
      throw new BadRequestException('Stall number is required');
    }

    const targetDate = date ? dayjs(date).startOf('day') : dayjs().startOf('day');
    const startOfDay = targetDate.startOf('day');
    const endOfDay = targetDate.endOf('day');

    if (fields === 'min') {
      const stalls = await this.prisma.stall.findMany({
        where: {
          stallNumber: {
            contains: id.toString(),
            mode: 'insensitive',
          },
        },
        select: {
          stallNumber: true,
          dailyFee: true,
          attendances: {
            where: {
              date: {
                gte: startOfDay.toDate(),
                lte: endOfDay.toDate(),
              },
            },
            select: {
              status: true,
              amount: true,
              date: true,
              transaction: {
                select: {
                  status: true,
                  amount: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      if (!stalls.length) {
        throw new NotFoundException(`No stalls found matching number "${id}"`);
      }

      const result = stalls.map((stall) => {
        const todayAttendance = stall.attendances[0] || null;
        const isPaid =
          todayAttendance?.status === 'PAID' ||
          todayAttendance?.transaction?.status === 'PAID';
        const amountDue = todayAttendance
          ? this.toNumber(todayAttendance.amount)
          : this.toNumber(stall.dailyFee);
        const status = todayAttendance
          ? (isPaid ? 'PAID' : todayAttendance.status || 'UNPAID')
          : 'NO_ATTENDANCE';

        return {
          stallNumber: stall.stallNumber,
          date: targetDate.format('YYYY-MM-DD'),
          amountDue,
          currency: amountDue ? 'UZS' : null,
          isPaid: !!isPaid,
          status,
        };
      });

      return {
        count: result.length,
        data: result,
        date: targetDate.format('YYYY-MM-DD'),
      };
    }

    const stalls = await this.prisma.stall.findMany({
      where: {
        stallNumber: {
          contains: id.toString(),
          mode: 'insensitive',
        },
      },
      include: {
        attendances: {
          where: {
            date: {
              gte: startOfDay.toDate(),
              lte: endOfDay.toDate(),
            },
          },
          include: {
            transaction: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        SaleType: true,
      },
    });

    if (!stalls.length) {
      throw new NotFoundException(`No stalls found matching number "${id}"`);
    }


    const result = stalls.map((stall) => {
      const todayAttendance = stall.attendances[0] || null;
      const paymentInfo = todayAttendance ? this.buildAttendancePaymentInfo(todayAttendance) : null;
      const amountFromStall = this.toNumber(stall.dailyFee);

      const paymentLinkAvailable =
        paymentInfo && paymentInfo.status !== 'PAID' ? paymentInfo.paymentUrl : null;
      const paymentLinks =
        paymentInfo && paymentInfo.status !== 'PAID' ? paymentInfo.urls : null;

      return {
        stall: {
          id: stall.id,
          stallNumber: stall.stallNumber,
          sectionId: stall.sectionId,
          area: stall.area,
          saleTypeId: stall.saleTypeId,
          description: stall.description,
          dailyFee: amountFromStall,
        },
        attendance: todayAttendance
          ? {
              id: todayAttendance.id,
              status: todayAttendance.status,
              amount: this.toNumber(todayAttendance.amount),
              date: dayjs(todayAttendance.date).format('YYYY-MM-DD'),
            }
          : null,
        payment: paymentInfo || {
          amountDue: amountFromStall,
          currency: amountFromStall ? 'UZS' : null,
          date: targetDate.format('YYYY-MM-DD'),
          status: todayAttendance ? todayAttendance.status || 'UNPAID' : 'NO_ATTENDANCE',
        },
        paymentUrl: paymentLinkAvailable,
        paymentUrls: paymentLinks,
      };
    });

    return {
      count: result.length,
      data: result,
      date: targetDate.format('YYYY-MM-DD'),
    };
  }

}
