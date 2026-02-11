import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ContractPaymentStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ContractMinimal = {
  id: number;
  issueDate: Date | null;
  createdAt: Date;
  shopMonthlyFee: Prisma.Decimal | null;
};

export type ContractPaymentSnapshot = {
  paidThrough: Date | null;
  nextPeriodStart: Date;
  monthsAhead: number;
  debtMonths: number;
  debtAmount: number;
  hasCurrentPeriodPaid: boolean;
};

@Injectable()
export class ContractPaymentPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfMonth(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private addMonths(date: Date, months: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  }

  private clampMonths(months?: number | null) {
    const parsed = Number(months);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.min(24, Math.max(1, Math.floor(parsed)));
  }

  private async getContract(contractId: number): Promise<ContractMinimal> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        issueDate: true,
        createdAt: true,
        shopMonthlyFee: true,
      },
    });
    if (!contract) throw new NotFoundException(`Contract with id ${contractId} not found`);
    return contract;
  }

  private fallbackStart(contract: ContractMinimal, reference?: Date | null) {
    if (reference) return this.startOfMonth(reference);
    return this.startOfMonth(contract.issueDate ?? contract.createdAt ?? new Date());
  }

  private async resolveNextStart(contractId: number, fallback: Date) {
    const latest = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId },
      orderBy: { periodStart: 'desc' },
    });
    if (latest) return this.addMonths(latest.periodStart, 1);
    return this.startOfMonth(fallback);
  }

  private async backfillContractPayments(contractId: number) {
    const transactions = await this.prisma.transaction.findMany({
      where: { contractId, status: 'PAID' },
      orderBy: { createdAt: 'asc' },
    });
    for (const tx of transactions) {
      await this.recordPaidTransaction(tx.id);
    }
  }

  private async ensureContractSeeded(contractId: number) {
    const hasPeriod = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId },
      select: { id: true },
    });
    if (hasPeriod) return;
    await this.backfillContractPayments(contractId);
  }

  private async ensureContractsSeeded(contractIds: number[]) {
    if (!contractIds.length) return;
    const lacking = await this.prisma.contract.findMany({
      where: {
        id: { in: contractIds },
        paymentPeriods: { none: {} },
      },
      select: { id: true },
    });
    for (const contract of lacking) {
      await this.backfillContractPayments(contract.id);
    }
  }

  private buildSnapshotFromPeriod(period: { periodEnd: Date } | null, fallbackNext: Date, monthlyFee: number): ContractPaymentSnapshot {
    const now = this.startOfMonth(new Date());
    const target = this.addMonths(now, 1); // We want to be paid through the end of the current month
    const paidThrough = period?.periodEnd ?? null;
    const nextPeriodStart = period ? this.startOfMonth(period.periodEnd) : this.startOfMonth(fallbackNext);
    
    // Months ahead of the current month
    const aheadDiff =
      (nextPeriodStart.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (nextPeriodStart.getUTCMonth() - now.getUTCMonth());
    
    // Months of debt (including current month if not paid)
    const debtDiff = 
      (target.getUTCFullYear() - nextPeriodStart.getUTCFullYear()) * 12 +
      (target.getUTCMonth() - nextPeriodStart.getUTCMonth());

    const monthsAhead = aheadDiff > 0 ? aheadDiff : 0;
    const debtMonths = debtDiff > 0 ? debtDiff : 0;
    const debtAmount = debtMonths * monthlyFee;
    
    const hasCurrentPeriodPaid = !!paidThrough && paidThrough > now;
    
    return {
      paidThrough,
      nextPeriodStart,
      monthsAhead,
      debtMonths,
      debtAmount,
      hasCurrentPeriodPaid,
    };
  }

  private selectPaymentIncludes() {
    return {
      transaction: {
        select: {
          id: true,
          transactionId: true,
          amount: true,
          status: true,
          paymentMethod: true,
          createdAt: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    };
  }

  async listPayments(contractId: number) {
    const contract = await this.getContract(contractId);
    await this.ensureContractSeeded(contract.id);
    const items = await this.prisma.contractPaymentPeriod.findMany({
      where: { contractId },
      orderBy: { periodStart: 'asc' },
      include: this.selectPaymentIncludes(),
    });
    const snapshot = await this.getSnapshotForContract(contract);
    return {
      contractId,
      items,
      snapshot,
    };
  }

  async recordPaidTransaction(transactionId: number, forcedStart?: Date, forcedMonths?: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { contract: true },
    });
    if (!transaction?.contractId || !transaction.contract) return null;
    if (transaction.status !== 'PAID') return null;

    const existingLink = await this.prisma.contractPaymentPeriod.findFirst({
      where: { transactionId: transaction.id },
    });
    if (existingLink) return existingLink;

    const contract = transaction.contract;
    const amount = Number(transaction.amount?.toString() ?? 0);
    const monthlyFee = Number(contract.shopMonthlyFee?.toString() ?? 0);
    
    // Prioritize forcedMonths from intent, fallback to amount-based calculation
    const months = forcedMonths ?? (
      monthlyFee > 0 ? this.clampMonths(Math.floor((amount + 0.0001) / monthlyFee) || 1) : 1
    );
    
    let start: Date;
    if (forcedStart) {
      start = this.startOfMonth(forcedStart);
    } else {
      const floor = this.fallbackStart(contract);
      start = await this.resolveNextStart(contract.id, floor);
    }

    await this.createSequentialPeriods({
      contract,
      start,
      months,
      status: ContractPaymentStatus.PAID,
      amount: contract.shopMonthlyFee ?? transaction.amount,
      transactionId: transaction.id,
    });
    return true;
  }

  private async createSequentialPeriods(params: {
    contract: ContractMinimal;
    start: Date;
    months: number;
    status: ContractPaymentStatus;
    amount: Prisma.Decimal | null;
    transactionId?: number;
    createdById?: number;
    notes?: string;
  }) {
    const { contract, start, months, status, amount, transactionId, createdById, notes } = params;
    
    const endRange = this.addMonths(start, months);
    const existingPeriods = await this.prisma.contractPaymentPeriod.findMany({
      where: {
        contractId: contract.id,
        periodStart: { gte: start, lt: endRange },
      },
    });

    const existingMap = new Map(existingPeriods.map(p => [p.periodStart.toISOString(), p]));
    const toCreate: any[] = [];

    for (let i = 0; i < months; i++) {
      const periodStart = this.addMonths(start, i);
      const periodEnd = this.addMonths(periodStart, 1);
      const existing = existingMap.get(periodStart.toISOString());

      if (existing) {
        if (existing.status !== status || existing.transactionId !== transactionId) {
          await this.prisma.contractPaymentPeriod.update({
            where: { id: existing.id },
            data: {
              status,
              transactionId: transactionId ?? existing.transactionId,
              amount: amount ?? existing.amount,
              notes: notes ?? existing.notes,
            },
          });
        }
      } else {
        toCreate.push({
          contractId: contract.id,
          periodStart,
          periodEnd,
          status,
          amount,
          transactionId,
          createdById,
          notes,
        });
      }
    }

    if (toCreate.length > 0) {
      await this.prisma.contractPaymentPeriod.createMany({
        data: toCreate,
      });
    }
  }

  async getSnapshotForContract(contract: ContractMinimal) {
    await this.ensureContractSeeded(contract.id);
    const latest = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId: contract.id, status: ContractPaymentStatus.PAID },
      orderBy: { periodEnd: 'desc' },
    });
    const monthlyFee = Number(contract.shopMonthlyFee?.toString() ?? 0);
    return this.buildSnapshotFromPeriod(latest, this.fallbackStart(contract), monthlyFee);
  }

  async getSnapshotsForContracts(contracts: ContractMinimal[]) {
    if (!contracts.length) return new Map<number, ContractPaymentSnapshot>();
    const ids = contracts.map((c) => c.id);
    await this.ensureContractsSeeded(ids);
    const rows = await this.prisma.contractPaymentPeriod.findMany({
      where: {
        contractId: { in: ids },
        status: ContractPaymentStatus.PAID,
      },
      orderBy: [
        { contractId: 'asc' },
        { periodEnd: 'desc' },
      ],
    });

    const latestMap = new Map<number, { periodEnd: Date }>();
    for (const row of rows) {
      if (!latestMap.has(row.contractId)) {
        latestMap.set(row.contractId, { periodEnd: row.periodEnd });
      }
    }

    const snapshotMap = new Map<number, ContractPaymentSnapshot>();
    for (const contract of contracts) {
      const latest = latestMap.get(contract.id) ?? null;
      const monthlyFee = Number(contract.shopMonthlyFee?.toString() ?? 0);
      snapshotMap.set(contract.id, this.buildSnapshotFromPeriod(latest, this.fallbackStart(contract), monthlyFee));
    }
    return snapshotMap;
  }

  async recordManualPayment(contractId: number, dto: { transferNumber: string; transferDate?: string; amount?: number; months?: number; startMonth?: string; notes?: string; }, createdById: number) {
    const contract = await this.getContract(contractId);
    const snapshot = await this.getSnapshotForContract(contract);
    if (snapshot.hasCurrentPeriodPaid) {
      throw new BadRequestException('Current period already paid; manual payment not allowed');
    }
    const transferNumber = dto.transferNumber?.trim();
    if (!transferNumber) {
      throw new BadRequestException('transferNumber is required');
    }
    const exists = await this.prisma.transaction.findUnique({
      where: { transactionId: transferNumber },
    });
    if (exists) {
      throw new BadRequestException('A transaction with this transferNumber already exists');
    }

    const fee = Number(contract.shopMonthlyFee?.toString() ?? 0);
    if (!fee || !(fee > 0)) {
      throw new ConflictException('Contract monthly fee is not configured');
    }

    let months = dto.months ? this.clampMonths(dto.months) : undefined;
    if (dto.amount !== undefined && dto.amount !== null) {
      const amountNum = Number(dto.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new BadRequestException('Invalid amount');
      }
      const quotient = amountNum / fee;
      if (Math.abs(Math.round(quotient) - quotient) > 1e-9) {
        throw new BadRequestException('Amount must be an exact multiple of the monthly fee');
      }
      if (!months) months = this.clampMonths(Math.round(quotient));
    }
    if (!months) months = 1;

    let start: Date;
    if (dto.startMonth) {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(dto.startMonth.trim());
      if (!m) throw new BadRequestException('startMonth must be in YYYY-MM format');
      const year = Number(m[1]);
      const monthIndex = Number(m[2]) - 1;
      start = new Date(Date.UTC(year, monthIndex, 1));
    } else {
      const fallback = this.fallbackStart(contract);
      start = await this.resolveNextStart(contract.id, fallback);
    }

    const totalAmount = dto.amount !== undefined && dto.amount !== null ? dto.amount : fee * months;
    const transferDate = dto.transferDate ? new Date(dto.transferDate) : new Date();
    if (Number.isNaN(transferDate.getTime())) {
      throw new BadRequestException('transferDate is invalid');
    }
    const tx = await this.prisma.transaction.create({
      data: {
        transactionId: transferNumber,
        amount: totalAmount as any,
        status: 'PAID',
        paymentMethod: PaymentMethod.CASH,
        contract: { connect: { id: contract.id } },
        createdAt: transferDate,
        performTime: transferDate,
        state: 2,
      },
    });

    await this.createSequentialPeriods({
      contract,
      start,
      months,
      status: ContractPaymentStatus.PAID,
      amount: contract.shopMonthlyFee,
      transactionId: tx.id,
      createdById,
      notes: dto.notes,
    });

    return this.listPayments(contract.id);
  }
}
