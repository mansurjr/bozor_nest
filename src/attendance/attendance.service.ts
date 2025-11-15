import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Prisma, AttendancePayment } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as base64 from 'base-64';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

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
    // Validate Stall exists
    const stall = await this.prisma.stall.findUnique({ where: { id: dto.stallId }, include: { SaleType: true } });
    if (!stall) throw new NotFoundException(`Stall with id ${dto.stallId} not found`);

    const feeNum = this.calculateStallFee(stall);

    return this.prisma.attendance.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        amount: new Prisma.Decimal(feeNum),
      },
      include: { Stall: true, transaction: true },
    });
  }

  async findAll(
    page = 1,
    limit = 10,
    filters?: { stallId?: number; dateFrom?: string; dateTo?: string },
  ) {
    const where: any = {};
    if (filters?.stallId) where.stallId = filters.stallId;
    if (filters?.dateFrom || filters?.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.date.lte = new Date(filters.dateTo);
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
      include: { Stall: true, transaction: true },
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
      throw new Error('Paid attendance cannot be modified');
    }

    const data: any = { ...dto };
    if (dto.date) data.date = new Date(dto.date);
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
      throw new Error('Paid attendance cannot be deleted');
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
      include: { Stall: true, transaction: true },
      orderBy: { date: 'desc' },
      take: lookBackDays,
    });

    return {
      stallId: attendance.stallId,
      total: items.length,
      days: lookBackDays,
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
