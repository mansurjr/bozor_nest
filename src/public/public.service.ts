
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetContractsDto } from './dto/contracts.dto';
import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { GetStallDto } from './dto/getPayInfo.dto';
dayjs.extend(isBetween);

function normalizeStoreNumber(value?: string): string | undefined {
  if (!value) return undefined;
  return value.trim().replace(/\s+/g, '').replace(/,/g, '.');
}

function normalizeTin(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s+/g, '').trim();
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) { }

  async contract(query: GetContractsDto) {
    const normalizedStoreNumber = normalizeStoreNumber(query.storeNumber);
    const normalizedTin = normalizeTin(query.tin);

    if (!normalizedStoreNumber && !normalizedTin) {
      throw new BadRequestException(
        'At least one parameter (storeNumber or tin) must be provided',
      );
    }


    const where: Prisma.ContractWhereInput = {};
    if (normalizedStoreNumber) where.store = { is: { storeNumber: normalizedStoreNumber } };
    if (normalizedTin) where.owner = { is: { tin: normalizedTin } };


    const contracts = await this.prisma.contract.findMany({
      where,
      include: {
        store: true,
        owner: true,
        transactions: {
          select: {
            createdAt: true,
            status: true,
          },
        },
      },
    });

    if (!contracts.length) {
      throw new BadRequestException('No contracts found for given parameters');
    }


    const startOfMonth = dayjs().startOf('month');
    const endOfMonth = dayjs().endOf('month');

    const result = contracts.map((contract) => {
      const paidThisMonth = contract.transactions.some(
        (tx) =>
          tx.status === 'PAID' &&
          dayjs(tx.createdAt).isBetween(startOfMonth, endOfMonth, 'day', '[]'),
      );


      const { transactions, ...rest } = contract;
      return { ...rest, paid: paidThisMonth };
    });

    return {
      count: result.length,
      data: result,
    };
  }

  async getStallStatus(query: GetStallDto) {
    const { id, date } = query;

    if (!id) {
      throw new BadRequestException('Stall number is required');
    }

    const targetDate = date ? dayjs(date).startOf('day') : dayjs().startOf('day');


    const stalls = await this.prisma.stall.findMany({
      where: {
        stallNumber: {
          contains: id.toString(),
          mode: 'insensitive',
        },
      },
      include: {
        attendances: {
          where: {
            date: targetDate.toDate(),
          },
        },
      },
    });

    if (!stalls.length) {
      throw new NotFoundException(`No stalls found matching number "${id}"`);
    }


    const result = stalls.map((stall) => {
      const todayAttendance = stall.attendances[0];
      const paid = todayAttendance?.status === 'PAID';

      return {
        id: stall.id,
        stallNumber: stall.stallNumber,
        sectionId: stall.sectionId,
        area: stall.area,
        dailyFee: stall.dailyFee,
        description: stall.description,
        paid,
        date: targetDate.format('YYYY-MM-DD'),
      };
    });

    return {
      count: result.length,
      data: result,
    };
  }

}
