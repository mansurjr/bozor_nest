import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { AttendancePayment, Prisma, SaleType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StallService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }


  async create(dto: CreateStallDto) {

    let dailyFee = new Prisma.Decimal(0);
    if (dto.saleTypeId) {
      const saleType = await this.prisma.saleType.findUnique({
        where: { id: dto.saleTypeId },
      });
      if (!saleType) throw new NotFoundException(`SaleType with id ${dto.saleTypeId} not found`);
      const feeNumber = Number(dto.area) * Number(saleType.tax);
      dailyFee = new Prisma.Decimal(Number.isFinite(feeNumber) ? feeNumber : 0);
    }


    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({
        where: { id: dto.sectionId },
      });
      if (!section) throw new NotFoundException(`Section with id ${dto.sectionId} not found`);
    }

    const newStall = await this.prisma.stall.create({
      data: { ...dto, dailyFee },
      include: { SaleType: true, Section: true },
    });
    const serviceId =
      this.config.get("PAYMENT_SERVICE_ID") ||
      this.config.get("CLICK_SERVICE_ID") ||
      this.config.get("serviceId");
    const merchantId =
      this.config.get("PAYMENT_MERCHANT_ID") ||
      this.config.get("CLICK_MERCHANT_ID") ||
      this.config.get("merchantId");
    const click_url =
      serviceId && merchantId
        ? `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${newStall.dailyFee.toString()}&transaction_param=${newStall.stallNumber}`
        : null;
    return await this.prisma.stall.update({
      where: { id: newStall.id },
      data: { click_payment_url: click_url ?? undefined },
      include: { SaleType: true, Section: true },
    });
  }


  async findAll(search?: string, page = 1, limit = 10) {
    const where: any = {};

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.stall.count({ where });
    const data = await this.prisma.stall.findMany({
      where,
      include: { SaleType: true, Section: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages =
      limit && limit > 0 ? Math.ceil(total / limit) : total > 0 ? 1 : 0;

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      total,
      page,
      limit,
    };
  }


  async findOne(id: number) {
    const stall = await this.prisma.stall.findUnique({
      where: { id },
      include: { SaleType: true, Section: true },
    });
    if (!stall) throw new NotFoundException(`Stall with id ${id} not found`);
    return stall;
  }


  async update(id: number, dto: UpdateStallDto) {
    const stall = await this.findOne(id);
    const nextArea = dto.area ?? stall.area;
    const nextSaleTypeId = dto.saleTypeId ?? stall.saleTypeId;
    let dailyFee = stall.dailyFee;
    let click_payment_url = stall.click_payment_url;


    if (nextSaleTypeId) {
      const saleType = await this.prisma.saleType.findUnique({
        where: { id: nextSaleTypeId },
      });
      if (!saleType) throw new NotFoundException(`SaleType with id ${nextSaleTypeId} not found`);
      const feeNumber = Number(nextArea) * Number(saleType.tax);
      dailyFee = new Prisma.Decimal(Number.isFinite(feeNumber) ? feeNumber : 0);
      const serviceId =
        this.config.get("PAYMENT_SERVICE_ID") ||
        this.config.get("CLICK_SERVICE_ID") ||
        this.config.get("serviceId");
      const merchantId =
        this.config.get("PAYMENT_MERCHANT_ID") ||
        this.config.get("CLICK_MERCHANT_ID") ||
        this.config.get("merchantId");
      click_payment_url =
        serviceId && merchantId
          ? `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${dailyFee.toString()}&transaction_param=${stall.stallNumber}`
          : click_payment_url;
    }


    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({
        where: { id: dto.sectionId },
      });
      if (!section) throw new NotFoundException(`Section with id ${dto.sectionId} not found`);
    }

    return this.prisma.stall.update({
      where: { id },
      data: { ...dto, dailyFee, click_payment_url },
      include: { SaleType: true, Section: true },
    });
  }


  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.stall.delete({ where: { id } });
  }

  async getHistory(id: number, days = 30) {
    const stall = await this.prisma.stall.findUnique({
      where: { id },
      include: { SaleType: true, Section: true },
    });
    if (!stall) throw new NotFoundException(`Stall with id ${id} not found`);

    const lookBackDays = Math.max(1, Math.min(120, Number(days) || 30));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (lookBackDays - 1));
    cutoff.setHours(0, 0, 0, 0);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        stallId: id,
        date: { gte: cutoff },
      },
      include: { transaction: true },
      orderBy: { date: 'desc' },
      take: lookBackDays,
    });

    const summary = attendances.reduce(
      (acc, attendance) => {
        const amount = Number(attendance.amount?.toString() ?? 0);
        const paid =
          attendance.status === AttendancePayment.PAID ||
          attendance.transaction?.status === 'PAID';
        if (paid) {
          acc.paidDays += 1;
          acc.paidAmount += amount;
        } else {
          acc.unpaidDays += 1;
          acc.unpaidAmount += amount;
        }
        return acc;
      },
      { paidDays: 0, unpaidDays: 0, paidAmount: 0, unpaidAmount: 0 },
    );

    return {
      stall,
      days: lookBackDays,
      rangeStart: cutoff,
      total: attendances.length,
      summary,
      items: attendances,
    };
  }

  async checkStallNumber(stallNumber: string) {
    const exists = await this.prisma.stall.findUnique({
      where: { stallNumber },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException(`Stall number "${stallNumber}" is already in use`);
    }

    return { valid: true, message: `Stall number "${stallNumber}" is available` };
  }
}
