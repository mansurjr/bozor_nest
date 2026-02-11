// transactions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ContractPaymentPeriodsService } from '../contract/contract-payment.service';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractPayments: ContractPaymentPeriodsService,
  ) {}

  private parseDate(val: string): Date | null {
    if (!val) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val);
    }

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(val)) {
      const [d, m, y] = val.split('.').map(Number);
      return new Date(y, m - 1, d);
    }

    if (/^\d{2}\.\d{2}$/.test(val)) {
      const parts = val.split('.').map(Number);
      const now = new Date();
      const y = now.getFullYear();

      const currentMonth = now.getMonth() + 1;
      if (parts[0] === currentMonth && parts[1] !== currentMonth) {
        return new Date(y, parts[0] - 1, parts[1]); // MM.DD
      }
      if (parts[1] === currentMonth && parts[0] !== currentMonth) {
        return new Date(y, parts[1] - 1, parts[0]); // DD.MM
      }

      return new Date(y, parts[1] - 1, parts[0]);
    }

    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  private toUzbekistanStartOfDay(val: string): Date | null {
    const d = this.parseDate(val);
    if (!d) return null;
    const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
    start.setUTCHours(start.getUTCHours() - 5);
    return start;
  }

  private toUzbekistanEndOfDay(val: string): Date | null {
    const d = this.parseDate(val);
    if (!d) return null;
    const end = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
    end.setUTCHours(end.getUTCHours() - 5);
    return end;
  }

  async create(dto: CreateTransactionDto) {
    const created = await this.prisma.transaction.create({ data: dto });
    if (created.contractId && created.status === 'PAID') {
      await this.contractPayments.recordPaidTransaction(created.id);
    }
    return created;
  }

  async findAll(params: {
    search?: string;
    page?: number;
    limit?: number;
    status?: string;
    paymentMethod?: string;
    source?: 'contract' | 'attendance';
    dateFrom?: string;
    dateTo?: string;
    contractId?: number;
    attendanceId?: number;
  } = {}) {
    const {
      search,
      page = 1,
      limit = 10,
      status,
      paymentMethod,
      source,
      dateFrom,
      dateTo,
      contractId,
      attendanceId,
    } = params;

    const take = Math.max(1, Number(limit) || 10);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    const where: Prisma.TransactionWhereInput = {};
    if (search) {
      const numeric = Number(search);
      // Ensure the number fits in a 32-bit signed integer (PostgreSQL INT4)
      const isInt32 = Number.isInteger(numeric) && numeric >= -2147483648 && numeric <= 2147483647;
      const includesNumber = !Number.isNaN(numeric) && isInt32;
      const normalizedSearch = search.trim().toUpperCase();
      const paymentMatches: ('CASH' | 'CLICK' | 'PAYME')[] = ['CASH', 'CLICK', 'PAYME'];
      const or: Prisma.TransactionWhereInput[] = [
        { transactionId: { contains: search, mode: 'insensitive' } },
        {
          contract: {
            owner: {
              fullName: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          contract: {
            store: {
              storeNumber: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          contract: {
            certificateNumber: { contains: search, mode: 'insensitive' },
          },
        },
        {
          attendance: {
            Stall: {
              OR: [
                { description: { contains: search, mode: 'insensitive' } },
                { stallNumber: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
      if (paymentMatches.includes(normalizedSearch as any)) {
        or.push({ paymentMethod: normalizedSearch as any });
      }
      if (includesNumber) {
        or.push({ id: { equals: numeric } });
        or.push({ attendanceId: { equals: numeric } });
        or.push({ contractId: { equals: numeric } });
      }
      where.OR = or;
    }

    if (status) {
      where.status = { equals: status };
    }
    if (paymentMethod) {
      where.paymentMethod = paymentMethod as PaymentMethod;
    }
    if (source === 'contract') {
      where.contractId = { not: null };
    } else if (source === 'attendance') {
      where.attendanceId = { not: null };
    }
    if (contractId) {
      where.contractId = Number(contractId);
    }
    if (attendanceId) {
      where.attendanceId = Number(attendanceId);
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const start = this.toUzbekistanStartOfDay(dateFrom);
        if (start) where.createdAt.gte = start;
      }
      if (dateTo) {
        const end = this.toUzbekistanEndOfDay(dateTo);
        if (end) where.createdAt.lte = end;
      }
    }

    const total = await this.prisma.transaction.count({ where });
    const data = await this.prisma.transaction.findMany({
      where,
      skip,
      take: take,
      orderBy: { createdAt: 'desc' },
      include: {
        contract: {
          include: {
            owner: true,
            store: true,
          },
        },
        attendance: {
          include: {
            Stall: true,
          },
        },
      },
    });

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
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            owner: true,
            store: true,
          },
        },
        attendance: {
          include: {
            Stall: true,
          },
        },
      },
    });
    if (!transaction) throw new NotFoundException(`Transaction ${id} not found`);
    return transaction;
  }

  async update(id: number, dto: UpdateTransactionDto) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: dto,
    });
    if (
      updated.contractId &&
      updated.status === 'PAID' &&
      existing.status !== 'PAID'
    ) {
      await this.contractPayments.recordPaidTransaction(updated.id);
    }
    return updated;
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.transaction.delete({ where: { id } });
  }
}
