import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateContractDto } from "./dto/create-contract.dto";
import { UpdateContractDto } from "./dto/update-contract.dto";
import { Prisma, ContractPaymentStatus, ContractPaymentType } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { ContractPaymentPeriodsService, ContractPaymentSnapshot } from "./contract-payment.service";
import { PaymeService } from "../payme/payme.service";
import { ClickWebhookService } from "../click_webhook/click_webhook.service";
import { forwardRef, Inject } from "@nestjs/common";


@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly contractPayments: ContractPaymentPeriodsService,
    @Inject(forwardRef(() => PaymeService))
    private readonly paymeService: PaymeService,
    @Inject(forwardRef(() => ClickWebhookService))
    private readonly clickService: ClickWebhookService,
  ) { }

  private hasValidPaymeUrl(url?: string | null) {
    if (!url) return false;
    if (!url.startsWith("https://checkout.paycom.uz/")) return false;
    const payload = url.replace("https://checkout.paycom.uz/", "");
    return payload.length > 0 && /^[A-Za-z0-9+/=]+$/.test(payload);
  }

  private normalizeAmount(amount?: any) {
    if (amount === null || amount === undefined) return null;
    if (typeof amount === "number" && !Number.isNaN(amount)) return amount.toString();
    if (typeof amount === "string") {
      const trimmed = amount.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      if (Number.isNaN(parsed)) return null;
      return parsed.toString();
    }
    if (typeof amount === "object" && amount !== null) {
      try {
        const s = amount.toString?.();
        if (typeof s === "string" && s.trim().length) return s;
      } catch {}
    }
    return null;
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
      const clickUrl = this.clickService.buildClickPaymentUrl(+amount, storeNumber);
      if (clickUrl) updateData.click_payment_url = clickUrl;
    }

    if (needsPayme) {
      const paymeUrl = this.paymeService.buildPaymePaymentUrl(+amount, storeNumber);
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

    const clickUrl = this.clickService.buildClickPaymentUrl(+amount, storeNumber);
    if (clickUrl) updateData.click_payment_url = clickUrl;

    const paymeUrl = this.paymeService.buildPaymePaymentUrl(+amount, storeNumber);
    if (paymeUrl) updateData.payme_payment_url = paymeUrl;

    if (!Object.keys(updateData).length) return null;

    return this.prisma.store.update({
      where: { id: storeId },
      data: updateData,
    });
  }

  private getCurrentMonthWindow(reference = new Date()) {
    const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { start, end };
  }

  private async hasPaidThisMonth(contractId: number) {
    const { start, end } = this.getCurrentMonthWindow();
    const period = await this.prisma.contractPaymentPeriod.findFirst({
      where: {
        contractId,
        periodStart: start,
        status: ContractPaymentStatus.PAID,
      },
    });
    if (period) return true;

    const existing = await this.prisma.transaction.findFirst({
      where: {
        contractId,
        status: "PAID",
        createdAt: {
          gte: start,
          lt: end,
        },
      },
    });
    return Boolean(existing);
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
      if (this.isOverlap(c.issueDate, c.expiryDate, newStart, newEnd  ) && c.isActive) {
        throw new ConflictException("Store is already occupied for the selected period");
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
        paymentType: dto.paymentType ?? ContractPaymentType.ONLINE,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate === null ? null : dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        shopMonthlyFee: dto.shopMonthlyFee ?? undefined,
      },
      include: {
        owner: true,
        store: true,
        createdBy: true,
        transactions: true,
      },
    });
    const normalizedAmount = this.normalizeAmount(dto.shopMonthlyFee ?? created.shopMonthlyFee);
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

  async findAll(
    page = 1,
    limit = 10,
    isActive?: boolean,
    search?: string,
    paid?: boolean,
    paymentType?: ContractPaymentType,
    ownerId?: number,
    storeId?: number,
    skipEnrichment = false,
  ) {
    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (paymentType) {
      where.paymentType = paymentType;
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (storeId) {
      where.storeId = storeId;
    }

    if (paid !== undefined) {
      const { start, end } = this.getCurrentMonthWindow();
      if (paid) {
        (where.AND as any[] | undefined) ??= [];
        (where.AND as any[]).push({
          OR: [
            { paymentPeriods: { some: { status: ContractPaymentStatus.PAID, periodStart: start } } },
            { transactions: { some: { status: 'PAID', createdAt: { gte: start, lt: end } } } },
          ],
        });
      } else {
        (where.AND as any[] | undefined) ??= [];
        (where.AND as any[]).push(
          { paymentPeriods: { none: { status: ContractPaymentStatus.PAID, periodStart: start } } },
          { transactions: { none: { status: 'PAID', createdAt: { gte: start, lt: end } } } },
        );
      }
    }

    const total = await this.prisma.contract.count({ where });
    const data = await this.prisma.contract.findMany({
      where,
      include: { owner: true, store: true, createdBy: true, archivedBy: true, transactions: {where : {status : "PAID"}} },
      orderBy: { createdAt: 'desc' },
      ...(limit !== undefined ? { skip: (page - 1) * limit, take: limit } : {}),
    });

    let enriched = data;
    if (!skipEnrichment) {
      enriched = [];
      for (const contract of data) {
        enriched.push(await this.ensureStorePaymentLinks(contract));
      }

      const snapshots = await this.contractPayments.getSnapshotsForContracts(
        data.map((c) => ({
          id: c.id,
          issueDate: c.issueDate,
          createdAt: c.createdAt,
          shopMonthlyFee: c.shopMonthlyFee,
        })) as any,
      );
      for (const contract of enriched) {
        const snapshot = snapshots.get(contract.id) ?? null;
        (contract as any).paymentSnapshot = snapshot;
        (contract as any).isPaidCurrentMonth = snapshot?.hasCurrentPeriodPaid ?? false;
      }
    }

    const totalPages =
      limit && limit > 0 ? Math.ceil(total / limit) : total > 0 ? 1 : 0;

    return {
      data: enriched,
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
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        owner: true,
        store: true,
        createdBy: true,
        archivedBy: true,
        transactions: true,
      },
    });
    if (!contract)
      throw new NotFoundException(`Contract with id ${id} not found`);
    const enriched = await this.ensureStorePaymentLinks(contract);
    const snapshot = await this.contractPayments.getSnapshotForContract({
      id: enriched.id,
      issueDate: enriched.issueDate,
      createdAt: enriched.createdAt,
      shopMonthlyFee: enriched.shopMonthlyFee,
    } as any);
    (enriched as any).paymentSnapshot = snapshot;
    (enriched as any).isPaidCurrentMonth = snapshot?.hasCurrentPeriodPaid ?? false;
    return enriched;
  }

  async getHistory(id: number, limit = 30) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        owner: true,
        store: true,
      },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with id ${id} not found`);
    }
    const cap = Math.max(1, Math.min(200, Number(limit) || 30));
    const transactions = await this.prisma.transaction.findMany({
      where: { contractId: id },
      orderBy: { createdAt: "desc" },
      take: cap,
    });

    const summary = transactions.reduce(
      (acc, tx) => {
        if (tx.status === "PAID") {
          acc.paid += 1;
          acc.amountPaid += Number((tx.amount && tx.amount.toString()) || 0);
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      { paid: 0, pending: 0, amountPaid: 0 }
    );

    return {
      contractId: id,
      limit: cap,
      total: transactions.length,
      summary,
      owner: {
        id: contract.ownerId,
        name: contract.owner?.fullName,
        tin: contract.owner?.tin,
      },
      store: {
        id: contract.storeId,
        number: contract.store?.storeNumber,
        description: contract.store?.description,
      },
      monthlyFee: contract.shopMonthlyFee,
      transactions,
    };
  }

  async refresh(id: number) {
    return this.findOne(id);
  }

  async getPaymentUrls(id: number, months?: number, startMonth?: string, method: 'CLICK' | 'PAYME' = 'CLICK'): Promise<string | null> {
    if (method === 'PAYME') {
      return this.paymeService.getContractPaymentUrl(id, months, startMonth);
    }
    return this.clickService.getContractPaymentUrl(id, months, startMonth);
  }

  async update(id: number, dto: UpdateContractDto, userId?: number) {
    const contract = await this.findOne(id);

    if (await this.hasPaidThisMonth(contract.id)) {
      throw new BadRequestException(
        "This contract has an active payment for the current month and cannot be modified until next month."
      );
    }

    const data: any = { ...dto };
    if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
    if (dto.expiryDate === null) {
      data.expiryDate = null;
    } else if (dto.expiryDate) {
      data.expiryDate = new Date(dto.expiryDate);
    }
    if (dto.shopMonthlyFee !== undefined) data.shopMonthlyFee = dto.shopMonthlyFee as any;
    if (dto.paymentType !== undefined) data.paymentType = dto.paymentType;
    
    // Archive tracking
    if (dto.isActive === false && contract.isActive === true) {
      data.archivedById = userId;
      data.archivedAt = new Date();
    } else if (dto.isActive === true && contract.isActive === false) {
      data.archivedById = null;
      data.archivedAt = null;
    }

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

  async remove(id: number, userId?: number) {
    await this.findOne(id);
    return this.prisma.contract.update({
      where: { id },
      data: { 
        isActive: false,
        archivedById: userId,
        archivedAt: new Date(),
      },
    });
  }
}
