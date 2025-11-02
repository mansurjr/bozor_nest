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
  ) { }

  private normalizeAmount(amount?: Prisma.Decimal | number | string | null) {
    if (amount === null || amount === undefined) return null;
    if (amount instanceof Prisma.Decimal) return amount.toString();
    if (typeof amount === "number" && !Number.isNaN(amount)) return amount.toString();
    if (typeof amount === "string") {
      const trimmed = amount.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return null;
      return parsed.toString();
    }
    return null;
  }

  private buildClickPaymentUrl(amount: string | null, transactionParam: string | number) {
    if (!amount) return null;

    const serviceId = this.config.get<string>("PAYMENT_SERVICE_ID");
    const merchantId = this.config.get<string>("PAYMENT_MERCHANT_ID");
    if (!serviceId || !merchantId) return null;

    return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${transactionParam}`;
  }

  private buildPaymePaymentUrl(amount: string | null, contractReference: string | number) {
    if (!amount || this.config.get<string>("TENANT_ID") !== "ipak_yuli") return null;

    const merchantId = this.config.get<string>("PAYME_MERCHANT_ID") || process.env.PAYME_MERCHANT_ID;
    if (!merchantId) return null;

    const domain = this.config.get<string>("MY_DOMAIN") || process.env.MY_DOMAIN || "https://myrent.uz";
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) return null;
    const amountInTiyin = Math.round(parsedAmount * 100);
    if (!amountInTiyin) return null;

    const params = `m=${merchantId};ac.contractId=${contractReference};id=1;ac.attendanceId=null;a=${amountInTiyin};c=${domain}`;
    const encoded = Buffer.from(params, "utf8").toString("base64");
    console.log(amountInTiyin)
    return `https://checkout.paycom.uz/${encoded}`;
  }

  private hasValidPaymeUrl(url?: string | null) {
    if (!url) return false;
    if (!url.startsWith("https://checkout.paycom.uz/")) return false;
    const payload = url.replace("https://checkout.paycom.uz/", "");
    return payload.length > 0 && /^[A-Za-z0-9+/=]+$/.test(payload);
  }

  private async ensureStorePaymentLinks(contract: any) {
    if (!contract?.store) return contract;

    const amount = this.normalizeAmount(contract.shopMonthlyFee);
    const storeNumber = contract.store.storeNumber ?? contract.storeId;

    if (!amount || !storeNumber) return contract;

    const needsClick = !contract.store.click_payment_url;
    const needsPayme =
      this.config.get<string>("TENANT_ID") === "ipak_yuli" &&
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

  private async syncStorePaymentLinks(storeId: number, storeNumber: string, amount: string | null) {
    if (!amount || !storeNumber) return null;

    const updateData: Record<string, string> = {};

    const clickUrl = this.buildClickPaymentUrl(amount, storeNumber);
    if (clickUrl) updateData.click_payment_url = clickUrl;

    const paymeUrl = this.buildPaymePaymentUrl(amount, storeNumber);
    if (paymeUrl) updateData.payme_payment_url = paymeUrl;

    if (!Object.keys(updateData).length) return null;

    return this.prisma.store.update({
      where: { id: storeId },
      data: updateData,
    });
  }

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
    const normalizedAmount = this.normalizeAmount(
      dto.shopMonthlyFee ?? created.shopMonthlyFee,
    );
    const storeNumber =
      created.store?.storeNumber ?? store.storeNumber ?? String(created.storeId);

    if (normalizedAmount && storeNumber) {
      const updatedStore = await this.syncStorePaymentLinks(
        store.id,
        storeNumber,
        normalizedAmount,
      );
      if (updatedStore) created.store = updatedStore as any;
    }

    return this.ensureStorePaymentLinks(created);
  }

  async findAll(page = 1, limit = 10, isActive?: boolean, search?: string) {
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

    const enriched = await Promise.all(
      data.map((contract) => this.ensureStorePaymentLinks(contract)),
    );

    return { total, page, limit, data: enriched };
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
    return this.ensureStorePaymentLinks(contract);
  }

  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.findOne(id);

    const data: any = { ...dto };
    if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);
    if (dto.shopMonthlyFee !== undefined)
      data.shopMonthlyFee = new Prisma.Decimal(dto.shopMonthlyFee);

    if (dto.ownerId !== undefined) {
      const owner = await this.prisma.owner.findUnique({
        where: { id: dto.ownerId },
      });
      if (!owner)
        throw new NotFoundException(`Owner with id ${dto.ownerId} not found`);
      data.owner = { connect: { id: dto.ownerId } };
      delete data.ownerId;
    }

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

    let syncedStore: any = null;
    if (dto.shopMonthlyFee !== undefined || dto.storeId !== undefined) {
      const storeId = dto.storeId ?? contract.storeId;
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
      });
      if (!store)
        throw new NotFoundException(`Store with id ${storeId} not found`);

      if (dto.storeId !== undefined) {
        data.store = { connect: { id: storeId } };
        delete data.storeId;
      }

      const normalizedAmount = this.normalizeAmount(
        dto.shopMonthlyFee ?? contract.shopMonthlyFee,
      );
      const storeNumber = store.storeNumber ?? String(storeId);

      if (normalizedAmount && storeNumber) {
        syncedStore = await this.syncStorePaymentLinks(
          store.id,
          storeNumber,
          normalizedAmount,
        );
      }
    }

    const updated = await this.prisma.contract.update({
      where: { id },
      data,
      include: {
        owner: true,
        store: true,
        createdBy: true,
        transactions: true,
      },
    });

    if (syncedStore) updated.store = syncedStore;

    return this.ensureStorePaymentLinks(updated);
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contract.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
