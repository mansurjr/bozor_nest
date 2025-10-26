import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { Prisma, SaleType } from '@prisma/client';

@Injectable()
export class StallService {
  constructor(private readonly prisma: PrismaService) { }


  async create(dto: CreateStallDto) {

    let dailyFee: Prisma.Decimal;
    if (dto.saleTypeId) {
      const saleType = await this.prisma.saleType.findUnique({
        where: { id: dto.saleTypeId },
      });
      if (!saleType) throw new NotFoundException(`SaleType with id ${dto.saleTypeId} not found`);
      dailyFee = new Prisma.Decimal(saleType.tax);
    } else {
      dailyFee = new Prisma.Decimal(0);
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
    const click_url = `https://my.click.uz/services/pay?service_id=${process.env.serviceId}&merchant_id=${process.env.merchantId!}&amount=${newStall.dailyFee}&${newStall.id}`
    return await this.prisma.stall.update({
      where: { id: newStall.id },
      data: { click_payment_url: click_url },
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

    return { total, page, limit, data };
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
    let dailyFee = stall.dailyFee;
    let click_payment_url = stall.click_payment_url;


    if (dto.saleTypeId) {
      const saleType = await this.prisma.saleType.findUnique({
        where: { id: dto.saleTypeId },
      });
      if (!saleType) throw new NotFoundException(`SaleType with id ${dto.saleTypeId} not found`);
      dailyFee = new Prisma.Decimal(saleType.tax);
      click_payment_url = `https://my.click.uz/services/pay?service_id=${process.env.serviceId}&merchant_id=${process.env.merchantId!}&amount=${dailyFee}&${id}`
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
}
