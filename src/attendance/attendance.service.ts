import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAttendanceDto) {
    // Validate Stall exists
    const stall = await this.prisma.stall.findUnique({ where: { id: dto.stallId }, include: { SaleType: true } });
    if (!stall) throw new NotFoundException(`Stall with id ${dto.stallId} not found`);

    const feeNum = (Number(stall.area) || 0) * (stall.SaleType ? Number(stall.SaleType.tax) || 0 : 0)

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
    const targetStallId = dto.stallId ?? existing.stallId
    const stall = await this.prisma.stall.findUnique({ where: { id: targetStallId }, include: { SaleType: true } })
    if (!stall) throw new NotFoundException(`Stall with id ${targetStallId} not found`)
    const feeNum = (Number(stall.area) || 0) * (stall.SaleType ? Number(stall.SaleType.tax) || 0 : 0)
    data.amount = new Prisma.Decimal(feeNum)

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

  async getPayUrl(id: number) {
    const attendance = await this.findOne(id);
    const amount = attendance.amount ? attendance.amount.toString() : '0';
    const serviceId = process.env.CLICK_SERVICE_ID || process.env.serviceId;
    const merchantId = process.env.CLICK_MERCHANT_ID || process.env.merchantId;
    const merchant_trans_id = String(attendance.id);
    const url = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&merchant_trans_id=${merchant_trans_id}`;
    return { url };
  }
}
