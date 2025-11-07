import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleTypeDto } from './dto/create-sales-type.dto';
import { UpdateSaleTypeDto } from './dto/update-sales-type.dto';

@Injectable()
export class SaleTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleTypeDto) {
    return this.prisma.saleType.create({ data: dto });
  }

  async findAll(search?: string, page = 1, limit = 10) {
    const take = Math.max(1, Number(limit) || 10);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    const where: Prisma.SaleTypeWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.saleType.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
      }),
      this.prisma.saleType.count({ where }),
    ]);

    return {
      data,
      pagination: {
        total,
        page: currentPage,
        limit: take,
        totalPages: Math.max(1, Math.ceil(total / take) || 1),
      },
    };
  }

  async findOne(id: number) {
    const saleType = await this.prisma.saleType.findUnique({ where: { id } });
    if (!saleType) throw new NotFoundException(`SaleType with id ${id} not found`);
    return saleType;
  }

  async update(id: number, dto: UpdateSaleTypeDto) {
    await this.findOne(id);
    return this.prisma.saleType.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.saleType.delete({ where: { id } });
  }
}
