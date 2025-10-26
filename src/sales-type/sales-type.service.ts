import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleTypeDto } from './dto/create-sales-type.dto';
import { UpdateSaleTypeDto } from './dto/update-sales-type.dto';

@Injectable()
export class SaleTypeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSaleTypeDto) {
    return this.prisma.saleType.create({ data: dto });
  }

  async findAll() {
    return this.prisma.saleType.findMany();
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
