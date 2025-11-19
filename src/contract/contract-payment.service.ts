import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractPaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentPeriodDto } from './dto/create-payment-period.dto';
import { UpdatePaymentPeriodDto } from './dto/update-payment-period.dto';

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

  private fallbackStart(contract: ContractMinimal) {
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

  async createManual(contractId: number, dto: CreatePaymentPeriodDto, createdById?: number) {
    const contract = await this.getContract(contractId);
    const months = this.clampMonths(dto.months);
    const amount =
      dto.amount !== undefined && dto.amount !== null
        ? new Prisma.Decimal(dto.amount)
        : contract.shopMonthlyFee ?? null;
    const status = dto.status ?? ContractPaymentStatus.PAID;
    const baseStart = dto.periodStart
      ? this.startOfMonth(new Date(dto.periodStart))
      : await this.resolveNextStart(contract.id, this.fallbackStart(contract));

    await this.createSequentialPeriods({
      contract,
      start: baseStart,
      months,
      amount,
      status,
      transactionId: dto.transactionId,
      createdById,
      notes: dto.notes,
    });
    return this.listPayments(contractId);
  }

  async updatePayment(contractId: number, paymentId: number, dto: UpdatePaymentPeriodDto) {
    const payment = await this.prisma.contractPaymentPeriod.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.contractId !== contractId) {
      throw new NotFoundException(`Payment period ${paymentId} not found for this contract`);
    }

    const data: Prisma.ContractPaymentPeriodUpdateInput = {};
    if (dto.status) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.transactionId !== undefined) {
      if (dto.transactionId === null) data.transaction = { disconnect: true };
      else data.transaction = { connect: { id: dto.transactionId } };
    }

    await this.prisma.contractPaymentPeriod.update({
      where: { id: paymentId },
      data,
    });
    return this.listPayments(contractId);
  }

  async removePayment(contractId: number, paymentId: number) {
    const payment = await this.prisma.contractPaymentPeriod.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.contractId !== contractId) {
      throw new NotFoundException(`Payment period ${paymentId} not found for this contract`);
    }
    await this.prisma.contractPaymentPeriod.delete({ where: { id: paymentId } });
    return this.listPayments(contractId);
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
    const start = await this.resolveNextStart(contract.id, this.fallbackStart(contract));

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
    const latest = await this.prisma.contractPaymentPeriod.findFirst({
      where: { contractId: contract.id, status: ContractPaymentStatus.PAID },
      orderBy: { periodEnd: 'desc' },
    });
    return this.buildSnapshotFromPeriod(latest, this.fallbackStart(contract));
  }

  async getSnapshotsForContracts(contracts: ContractMinimal[]) {
    if (!contracts.length) return new Map<number, ContractPaymentSnapshot>();
    const ids = contracts.map((c) => c.id);
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
}

