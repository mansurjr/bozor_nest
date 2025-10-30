import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContractDto } from "./dto/create-contract.dto";
import { UpdateContractDto } from "./dto/update-contract.dto";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private isOverlap(
    aStart?: Date | null,
    aEnd?: Date | null,
    bStart?: Date | null,
    bEnd?: Date | null
  ) {
    const startA = aStart ?? new Date(-8640000000000000);
    const endA = aEnd ?? new Date(8640000000000000);
    const startB = bStart ?? new Date(-8640000000000000);
    const endB = bEnd ?? new Date(8640000000000000);
    return startA <= endB && startB <= endA;
  }

  private async ensureStoreNotOccupied(
    storeId: number,
    issueDate?: string | Date | null,
    expiryDate?: string | Date | null,
    excludeContractId?: number
  ) {
    const existing = await this.prisma.contract.findMany({
      where: {
        storeId,
        isActive: true,
        ...(excludeContractId ? { NOT: { id: excludeContractId } } : {}),
      },
      select: { id: true, issueDate: true, expiryDate: true, isActive: true },
    });

    const newStart = issueDate ? new Date(issueDate) : null;
    const newEnd = expiryDate ? new Date(expiryDate) : null;

    for (const c of existing) {
      if (this.isOverlap(c.issueDate, c.expiryDate, newStart, newEnd)) {
        throw new Error("Store is already occupied for the selected period");
      }
    }
  }

  async create(dto: CreateContractDto, createdById: number) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: dto.ownerId },
    });
    if (!owner)
      throw new NotFoundException(`Owner with id ${dto.ownerId} not found`);

    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
    });
    if (!store)
      throw new NotFoundException(`Store with id ${dto.storeId} not found`);

    await this.ensureStoreNotOccupied(
      dto.storeId,
      dto.issueDate as any,
      dto.expiryDate as any
    );

    const created = await this.prisma.contract.create({
      data: {
        ...dto,
        createdById,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        shopMonthlyFee: dto.shopMonthlyFee
          ? new Prisma.Decimal(dto.shopMonthlyFee)
          : undefined,
      },
      include: {
        owner: true,
        store: true,
        createdBy: true,
        transactions: true,
      },
    });

    const serviceId = this.config.get<string>("CLICK_SERVICE_ID") || this.config.get<string>("serviceId");
    const merchantId = this.config.get<string>("CLICK_MERCHANT_ID") || this.config.get<string>("merchantId");
    const amount = dto.shopMonthlyFee ?? created.shopMonthlyFee?.toString() ?? "";
    const click_url = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&merchant_trans_id=${created.store.storeNumber}`;

    await this.prisma.store.update({
      where: { id: store.id },
      data: { click_payment_url: click_url },
    });

    return created;
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
      include: {
        owner: true,
        store: true,
        createdBy: true,
        transactions: true,
      },
    });
    if (!contract)
      throw new NotFoundException(`Contract with id ${id} not found`);
    return contract;
  }

  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.findOne(id);

    const data: any = { ...dto };
    if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);
    if (dto.shopMonthlyFee !== undefined)
      data.shopMonthlyFee = new Prisma.Decimal(dto.shopMonthlyFee);

    let click_payment_url = contract.store.click_payment_url;

    if (
      dto.storeId !== undefined ||
      dto.issueDate !== undefined ||
      dto.expiryDate !== undefined ||
      dto.isActive !== undefined
    ) {
      const targetStoreId = dto.storeId ?? contract.storeId;
      const newStart = dto.issueDate ?? contract.issueDate ?? undefined;
      const newEnd = dto.expiryDate ?? contract.expiryDate ?? undefined;
      const active = dto.isActive ?? contract.isActive;

      if (active) {
        await this.ensureStoreNotOccupied(
          targetStoreId,
          newStart as any,
          newEnd as any,
          id
        );
      }
    }

    if (dto.shopMonthlyFee !== undefined || dto.storeId !== undefined) {
      const storeId = dto.storeId ?? contract.storeId;
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
      });
      if (!store)
        throw new NotFoundException(`Store with id ${storeId} not found`);

      const serviceId = this.config.get<string>("CLICK_SERVICE_ID") || this.config.get<string>("serviceId");
      const merchantId = this.config.get<string>("CLICK_MERCHANT_ID") || this.config.get<string>("merchantId");
      const amount = dto.shopMonthlyFee ?? contract.shopMonthlyFee;
      click_payment_url = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&merchant_trans_id=${contract.id}`;
      data.click_payment_url = click_payment_url;

      await this.prisma.store.update({
        where: { id: store.id },
        data: { click_payment_url },
      });
    }

    return this.prisma.contract.update({
      where: { id },
      data,
      include: {
        owner: true,
        store: true,
        createdBy: true,
        transactions: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contract.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
