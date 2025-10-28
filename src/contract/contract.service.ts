import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContractService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateContractDto, createdById: number) {
    const owner = await this.prisma.owner.findUnique({ where: { id: dto.ownerId } });
    if (!owner) throw new NotFoundException(`Owner with id ${dto.ownerId} not found`);

    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException(`Store with id ${dto.storeId} not found`);

    const click_url = `https://my.click.uz/services/pay?service_id=${process.env.serviceId}&merchant_id=${process.env.merchantId!}&amount=${dto.shopMonthlyFee}&${store.id}`

    await this.prisma.store.update({
      where: { id: store.id },
      data: { click_payment_url: click_url },
    });

    return this.prisma.contract.create({
      data: {
        ...dto,
        createdById,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        shopMonthlyFee: dto.shopMonthlyFee ? new Prisma.Decimal(dto.shopMonthlyFee) : undefined,
      },
      include: { owner: true, store: true, createdBy: true, transactions: true },
    });
  }

 async findAll(page = 1, limit = 10, isActive?: boolean) {
  const where: Prisma.ContractWhereInput = {};

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const total = await this.prisma.contract.count({ where });
  const data = await this.prisma.contract.findMany({
    where,
    include: { owner: true, store: true, createdBy: true, transactions: true },
    skip: (page - 1) * limit,
    take: limit,
  });

  return { total, page, limit, data };
}


  async findOne(id: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { owner: true, store: true, createdBy: true, transactions: true },
    });
    if (!contract) throw new NotFoundException(`Contract with id ${id} not found`);
    return contract;
  }

  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.findOne(id);

    const data: any = { ...dto };
    if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);
    if (dto.shopMonthlyFee !== undefined) data.shopMonthlyFee = new Prisma.Decimal(dto.shopMonthlyFee);

    let click_payment_url = contract.store.click_payment_url;
    if (dto.shopMonthlyFee !== undefined || dto.storeId !== undefined) {
      const storeId = dto.storeId ?? contract.storeId;
      const store = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!store) throw new NotFoundException(`Store with id ${storeId} not found`);

      const amount = dto.shopMonthlyFee ?? contract.shopMonthlyFee;
      click_payment_url = `https://my.click.uz/services/pay?service_id=${process.env.serviceId}&merchant_id=${process.env.merchantId!}&amount=${amount}&${store.id}`;
      data.click_payment_url = click_payment_url;

      await this.prisma.store.update({
        where: { id: store.id },
        data: { click_payment_url },
      });
    }

    return this.prisma.contract.update({
      where: { id },
      data,
      include: { owner: true, store: true, createdBy: true, transactions: true },
    });
  }


  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contract.update({ where: { id }, data: { isActive: false } })
  }
}
