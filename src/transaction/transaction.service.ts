// transactions.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto) {
    return this.prisma.transaction.create({ data: dto });
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
      const includesNumber = !Number.isNaN(numeric);
      const normalizedSearch = search.trim().toUpperCase();
      const paymentMatches: ('CASH' | 'CLICK' | 'PAYME')[] = ['CASH', 'CLICK', 'PAYME'];
      const or: Prisma.TransactionWhereInput[] = [
        { transactionId: { contains: search, mode: 'insensitive' } },
        { status: { contains: search, mode: 'insensitive' } },
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
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
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
      }),
      this.prisma.transaction.count({ where }),
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
    await this.findOne(id);
    return this.prisma.transaction.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.transaction.delete({ where: { id } });
  }
}
