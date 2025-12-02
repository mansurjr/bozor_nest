import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  private buildSnapshotFromPeriod(period: { periodEnd: Date } | null, fallbackNext: Date): ContractPaymentSnapshot {
    const now = this.startOfMonth(new Date());
    const paidThrough = period?.periodEnd ?? null;
    const nextPeriodStart = period ? this.startOfMonth(period.periodEnd) : this.startOfMonth(fallbackNext);
    const monthsAhead =
      (nextPeriodStart.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (nextPeriodStart.getUTCMonth() - now.getUTCMonth());
    const hasCurrentPeriodPaid = !!paidThrough && paidThrough > now;
    return {
      paidThrough,
      nextPeriodStart,
      monthsAhead: monthsAhead < 0 ? 0 : monthsAhead,
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

  async recordPaidTransaction(transactionId: number) {
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
    const months =
      monthlyFee > 0 ? this.clampMonths(Math.floor((amount + 0.0001) / monthlyFee) || 1) : 1;
    // Determine start: next unpaid month if any; otherwise, allocate ending at current month
    const latest = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId: contract.id, status: ContractPaymentStatus.PAID },
      orderBy: { periodEnd: 'desc' },
      select: { periodStart: true },
    });
    let start: Date;
    if (latest) {
      start = this.addMonths(latest.periodStart, 1);
    } else {
      const nowStart = this.startOfMonth(new Date());
      // allocate backward to cover backlog up to current month
      start = this.addMonths(nowStart, 1 - months);
      // clamp to contract start if necessary
      const floor = this.fallbackStart(contract);
      if (start < floor) start = floor;
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
    for (let i = 0; i < months; i++) {
      const periodStart = this.addMonths(start, i);
      const periodEnd = this.addMonths(periodStart, 1);

      const existing = await this.prisma.contractPaymentPeriod.findUnique({
        where: {
          contractId_periodStart: {
            contractId: contract.id,
            periodStart,
          },
        },
      });
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
        continue;
      }

      await this.prisma.contractPaymentPeriod.create({
        data: {
          contractId: contract.id,
          periodStart,
          periodEnd,
          status,
          amount,
          transactionId,
          createdById,
          notes,
        },
      });
    }
  }

  async getSnapshotForContract(contract: ContractMinimal) {
    await this.ensureContractSeeded(contract.id);
    const latest = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId: contract.id, status: ContractPaymentStatus.PAID },
      orderBy: { periodEnd: 'desc' },
    });
    return this.buildSnapshotFromPeriod(latest, this.fallbackStart(contract));
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
      snapshotMap.set(contract.id, this.buildSnapshotFromPeriod(latest, this.fallbackStart(contract)));
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
      throw new Error('Contract monthly fee is not configured');
    }

    let months = dto.months ? this.clampMonths(dto.months) : undefined;
    if (dto.amount !== undefined && dto.amount !== null) {
      const amountNum = Number(dto.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        throw new Error('Invalid amount');
      }
      const quotient = amountNum / fee;
      if (Math.abs(Math.round(quotient) - quotient) > 1e-9) {
        throw new Error('Amount must be an exact multiple of the monthly fee');
      }
      if (!months) months = this.clampMonths(Math.round(quotient));
    }
    if (!months) months = 1;

    // Determine period start
    let start: Date;
    if (dto.startMonth) {
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(dto.startMonth.trim());
      if (!m) throw new Error('startMonth must be in YYYY-MM format');
      const year = Number(m[1]);
      const monthIndex = Number(m[2]) - 1;
      start = new Date(Date.UTC(year, monthIndex, 1));
    } else {
      const fallback = this.fallbackStart(contract);
      start = await this.resolveNextStart(contract.id, fallback);
    }

    // Create a transaction record
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
