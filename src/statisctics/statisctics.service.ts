import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Transaction } from '@prisma/client';

type EntityType = 'stall' | 'store';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) { }

  async getDailyStatistics(type?: EntityType) {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    let stallPayments: Transaction[] = [];
    let storePayments: Transaction[] = [];

    if (!type || type === 'stall') {
      stallPayments = await this.prisma.transaction.findMany({
        where: { attendance: { date: { gte: todayStart, lte: todayEnd }, status: 'PAID' } },
      });
    }

    if (!type || type === 'store') {
      storePayments = await this.prisma.transaction.findMany({
        where: {
          contract: { isActive: true },
          createdAt: { gte: todayStart, lte: todayEnd },
          status: 'PAID',
        },
      });
    }

    const count = stallPayments.length + storePayments.length;
    const revenue =
      stallPayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0) +
      storePayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0);

    return { count, revenue };
  }

  async getMonthlyStatistics(type?: EntityType) {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    let stallPayments: Transaction[] = [];
    let storePayments: Transaction[] = [];

    if (!type || type === 'stall') {
      stallPayments = await this.prisma.transaction.findMany({
        where: { attendance: { date: { gte: monthStart, lte: monthEnd }, status: 'PAID' } },
      });
    }

    if (!type || type === 'store') {
      storePayments = await this.prisma.transaction.findMany({
        where: {
          contract: { isActive: true },
          createdAt: { gte: monthStart, lte: monthEnd },
          status: 'PAID',
        },
      });
    }

    const count = stallPayments.length + storePayments.length;
    const revenue =
      stallPayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0) +
      storePayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0);

    return { count, revenue };
  }

  async getCurrentMonthIncome(type?: EntityType) {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    let stallPayments: Transaction[] = [];
    let storePayments: Transaction[] = [];

    if (!type || type === 'stall') {
      stallPayments = await this.prisma.transaction.findMany({
        where: { attendance: { date: { gte: monthStart, lte: monthEnd }, status: 'PAID' } },
      });
    }

    if (!type || type === 'store') {
      storePayments = await this.prisma.transaction.findMany({
        where: {
          contract: { isActive: true },
          createdAt: { gte: monthStart, lte: monthEnd },
          status: 'PAID',
        },
      });
    }

    const revenue =
      stallPayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0) +
      storePayments.reduce((sum, t) => sum + Number(t.amount.toString()), 0);

    return { revenue };
  }
}
