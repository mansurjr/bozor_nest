import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Transaction, Attendance } from '@prisma/client';

type EntityType = 'stall' | 'store';

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) { }

  private decimalToNumber(value?: any) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value?.toString?.() ?? value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private sumTransactions(transactions: Transaction[]) {
    return transactions.reduce((sum, t) => sum + this.decimalToNumber(t.amount), 0);
  }

  private sumAttendances(attendances: Attendance[]) {
    return attendances.reduce((sum, item) => sum + this.decimalToNumber(item.amount), 0);
  }

  private async collectStallPayments(from: Date, to: Date) {
    const [paidTransactions, manualAttendances] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          attendanceId: { not: null },
          attendance: {
            date: { gte: from, lte: to },
          },
          OR: [
            { status: 'PAID' },
            { attendance: { status: 'PAID' } },
          ],
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          date: { gte: from, lte: to },
          status: 'PAID',
          transaction: { is: null },
        },
      }),
    ]);

    return {
      count: paidTransactions.length + manualAttendances.length,
      revenue: this.sumTransactions(paidTransactions) + this.sumAttendances(manualAttendances),
    };
  }

  private async collectStorePayments(from: Date, to: Date) {
    const storePayments = await this.prisma.transaction.findMany({
      where: {
        contract: { isActive: true },
        createdAt: { gte: from, lte: to },
        status: 'PAID',
      },
    });
    return {
      count: storePayments.length,
      revenue: this.sumTransactions(storePayments),
    };
  }

  async getDailyStatistics(type?: EntityType) {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const stallResult = !type || type === 'stall'
      ? await this.collectStallPayments(todayStart, todayEnd)
      : { count: 0, revenue: 0 };

    const storeResult = !type || type === 'store'
      ? await this.collectStorePayments(todayStart, todayEnd)
      : { count: 0, revenue: 0 };

    return {
      count: stallResult.count + storeResult.count,
      revenue: stallResult.revenue + storeResult.revenue,
    };
  }

  async getMonthlyStatistics(type?: EntityType) {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const stallResult = !type || type === 'stall'
      ? await this.collectStallPayments(monthStart, monthEnd)
      : { count: 0, revenue: 0 };

    const storeResult = !type || type === 'store'
      ? await this.collectStorePayments(monthStart, monthEnd)
      : { count: 0, revenue: 0 };

    return {
      count: stallResult.count + storeResult.count,
      revenue: stallResult.revenue + storeResult.revenue,
    };
  }

  async getCurrentMonthIncome(type?: EntityType) {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(new Date());

    const stallRevenue = !type || type === 'stall'
      ? await this.collectStallPayments(monthStart, monthEnd)
      : { revenue: 0 };

    const storeRevenue = !type || type === 'store'
      ? await this.collectStorePayments(monthStart, monthEnd)
      : { revenue: 0 };

    return {
      revenue: (stallRevenue.revenue || 0) + (storeRevenue.revenue || 0),
    };
  }
}
