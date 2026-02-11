import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Prisma, AttendancePayment } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as base64 from 'base-64';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

  private parseDate(val: string): Date | null {
    if (!val) return null;

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val);
    }

    // DD.MM.YYYY
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
      const [d, m, y] = val.split('.').map(Number);
      return new Date(y, m - 1, d);
    }

    // DD.MM or MM.DD (Try to match current date for ambiguity)
    if (/^\d{2}\.\d{2}$/.test(val)) {
      const parts = val.split('.').map(Number);
      const now = new Date();
      const y = now.getFullYear();

      // If one part matches current month, prioritize that as the month
      const currentMonth = now.getMonth() + 1;
      if (parts[0] === currentMonth && parts[1] !== currentMonth) {
        return new Date(y, parts[0] - 1, parts[1]); // MM.DD
      }
      if (parts[1] === currentMonth && parts[0] !== currentMonth) {
        return new Date(y, parts[1] - 1, parts[0]); // DD.MM
      }

      // Default to DD.MM for Uzbekistan/EU standard
      return new Date(y, parts[1] - 1, parts[0]);
    }

    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  private normalizeDateOnly(dateInput: string | Date) {
    let parsed: Date | null;
    if (dateInput instanceof Date) {
      parsed = dateInput;
    } else {
      parsed = this.parseDate(dateInput);
    }

    if (!parsed || Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid attendance date');
    }
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }

  private roundCurrency(value?: number | null) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return 0;
    }
    return Math.round(value * 100) / 100;
  }

  private calculateStallFee(stall: { area?: number | null; SaleType?: { tax?: number | null } | null }) {
    const area = Number(stall?.area) || 0;
    const tax = Number(stall?.SaleType?.tax) || 0;
    return this.roundCurrency(area * tax);
  }

  private normalizeAttendanceAmount(amount?: Prisma.Decimal | number | string | null) {
    let numeric = 0;
    if (amount instanceof Prisma.Decimal) {
      numeric = Number(amount.toString());
    } else if (typeof amount === 'number') {
      numeric = amount;
    } else if (typeof amount === 'string') {
      numeric = Number(amount);
    }
    const rounded = this.roundCurrency(Number.isFinite(numeric) ? numeric : 0);
    return {
      rounded,
      formatted: rounded.toFixed(2),
      tiyin: Math.round(rounded * 100),
    };
  }

  async create(dto: CreateAttendanceDto) {
    const normalizedDate = this.normalizeDateOnly(dto.date);
    // Validate Stall exists
    const stall = await this.prisma.stall.findUnique({ where: { id: dto.stallId }, include: { SaleType: true } });
    if (!stall) throw new NotFoundException(`Stall with id ${dto.stallId} not found`);

    const feeNum = this.calculateStallFee(stall);
    const amountDecimal = new Prisma.Decimal(feeNum);

    const existing = await this.prisma.attendance.findUnique({
      where: { stallId_date: { stallId: dto.stallId, date: normalizedDate } },
      include: { Stall: true, transaction: true },
    });

    if (existing) {
      const isPaid =
        existing.status === AttendancePayment.PAID ||
        (existing.transaction && existing.transaction.status === 'PAID');
      if (isPaid) {
        throw new BadRequestException('Attendance for this stall and date is already paid and cannot be recreated');
      }

      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: dto.status ?? existing.status,
          amount: amountDecimal,
        },
        include: { Stall: true, transaction: true },
      });
    }

    return this.prisma.attendance.create({
      data: {
        stallId: dto.stallId,
        status: dto.status ?? AttendancePayment.UNPAID,
        date: normalizedDate,
        amount: amountDecimal,
      },
      include: { Stall: true, transaction: true },
    });
  }

  async findAll(
    page = 1,
    limit = 10,
    filters?: { stallId?: number; date?: string; dateFrom?: string; dateTo?: string; search?: string },
  ) {
    const where: any = {};
    if (filters?.stallId) where.stallId = filters.stallId;

    if (filters?.search) {
      where.Stall = {
        OR: [
          { stallNumber: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }
    if (filters?.date || filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      const startInput = filters.date || filters.dateFrom;
      const endInput = filters.date || filters.dateTo;

      if (startInput) {
        const start = this.parseDate(startInput);
        if (start) {
          where.date.gte = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
        }
      }
      if (endInput) {
        const end = this.parseDate(endInput);
        if (end) {
          where.date.lte = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
        }
      }
    }

    const total = await this.prisma.attendance.count({ where });
    const data = await this.prisma.attendance.findMany({
      where,
      include: { Stall: true, transaction: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { date: 'desc' },
    });

    return { total, page, limit, data };
  }

  async findOne(id: number) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { Stall: { include: { Section: true, SaleType: true } }, transaction: true },
    });
    if (!attendance) throw new NotFoundException(`Attendance with id ${id} not found`);
    return attendance;
  }

  async update(id: number, dto: UpdateAttendanceDto) {
    const existing = await this.findOne(id);

    const isPaid =
      existing.status === 'PAID' ||
      (existing.transaction && existing.transaction.status === 'PAID');
    if (isPaid) {
      throw new BadRequestException('Paid attendance cannot be modified');
    }

    const data: any = { ...dto };
    if (dto.date) data.date = this.normalizeDateOnly(dto.date);
    // Recompute amount based on target stall
    const targetStallId = dto.stallId ?? existing.stallId;
    const stall = await this.prisma.stall.findUnique({ where: { id: targetStallId }, include: { SaleType: true } });
    if (!stall) throw new NotFoundException(`Stall with id ${targetStallId} not found`);
    const feeNum = this.calculateStallFee(stall);
    data.amount = new Prisma.Decimal(feeNum);

    return this.prisma.attendance.update({
      where: { id },
      data,
      include: { Stall: true, transaction: true },
    });
  }

  async remove(id: number) {
    const existing = await this.findOne(id);
    const isPaid =
      existing.status === 'PAID' ||
      (existing.transaction && existing.transaction.status === 'PAID');
    if (isPaid) {
      throw new BadRequestException('Paid attendance cannot be deleted');
    }
    return this.prisma.attendance.delete({ where: { id } });
  }

  private async syncAttendanceWithTransactions(attendance: any) {
    if (!attendance) return attendance;
    if (attendance.status === 'PAID') return attendance;

    const latestPaidTx = await this.prisma.transaction.findFirst({
      where: { attendanceId: attendance.id, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
    });
    if (!latestPaidTx) return attendance;

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: { status: AttendancePayment.PAID, transactionId: latestPaidTx.id },
      include: { Stall: true, transaction: true },
    });
  }

  async refreshStatus(id: number) {
    const attendance = await this.findOne(id);
    return this.syncAttendanceWithTransactions(attendance);
  }

  async getHistory(id: number, days = 30) {
    const attendance = await this.findOne(id);
    const lookBackDays = Number.isFinite(days) && days > 0 ? days : 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (lookBackDays - 1));
    cutoff.setHours(0, 0, 0, 0);

    const items = await this.prisma.attendance.findMany({
      where: {
        stallId: attendance.stallId,
        date: { gte: cutoff },
      },
      include: {
        Stall: {
          include: {
            Section: true,
            SaleType: true,
          },
        },
        transaction: true,
      },
      orderBy: { date: 'desc' },
      take: lookBackDays,
    });

    const summary = items.reduce(
      (acc, item) => {
        const amount = Number((item.amount && item.amount.toString()) || 0);
        if (item.status === AttendancePayment.PAID || item.transaction?.status === 'PAID') {
          acc.paid += 1;
          acc.amountPaid += amount;
        } else {
          acc.unpaid += 1;
          acc.amountUnpaid += amount;
        }
        return acc;
      },
      { paid: 0, unpaid: 0, amountPaid: 0, amountUnpaid: 0 },
    );

    const stallDetails = await this.prisma.stall.findUnique({
      where: { id: attendance.stallId },
      include: {
        Section: true,
        SaleType: true,
      },
    });

    return {
      stallId: attendance.stallId,
      stallInfo: {
        number: stallDetails?.stallNumber,
        description: stallDetails?.description,
        sectionName: stallDetails?.Section?.name,
        saleType: stallDetails?.SaleType?.name,
      },
      total: items.length,
      days: lookBackDays,
      summary,
      items,
    };
  }

  async getPayUrl(id: number, type: string) {
    const attendance = await this.findOne(id);
    const amountInfo = this.normalizeAttendanceAmount(attendance.amount);

    if (type === "click") {
      const serviceId =
        this.config.get("PAYMENT_SERVICE_ID") || process.env.PAYMENT_SERVICE_ID;
      const merchantId =
        this.config.get("PAYMENT_MERCHANT_ID") || process.env.PAYMENT_MERCHANT_ID;

      const url = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amountInfo.formatted}&transaction_param=${attendance.id}`;
      return { url };
    }

    if (this.config.get<string>("TENANT_ID") !== "ipak_yuli") {
      return { url: null };
    }

    const merchantId = this.config.get<string>("PAYME_MERCHANT_ID") || process.env.PAYME_MERCHANT_ID;
    if (!merchantId || !amountInfo.tiyin) {
      return { url: null };
    }

    const params = `m=${merchantId};ac.id=1;ac.attendanceId=${attendance.id};ac.contractId=null;a=${amountInfo.tiyin};c=https://myrent.uz/attendances`;
    const latinPayload = Buffer.from(params, "utf8").toString("latin1");
    const encoded = base64.encode(latinPayload);
    const url = `https://checkout.paycom.uz/${encoded}`;
    return { url };
  }
}
