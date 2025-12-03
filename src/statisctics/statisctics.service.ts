import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Transaction, Attendance } from '@prisma/client';

type EntityType = 'stall' | 'store';
type PaymentMethod = 'PAYME' | 'CLICK' | 'CASH';
type TxStatus = string;

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

  private parseDate(input?: string): Date | null {
    if (!input) return null;
    const n = Number(input);
    if (!Number.isNaN(n)) {
      const d = new Date(n);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private normalizeRange(from?: string, to?: string) {
    const now = new Date();
    const fromDate = this.parseDate(from) ?? startOfDay(now);
    const toDate = this.parseDate(to) ?? endOfDay(now);
    return { from: fromDate, to: toDate };
  }

  private monthRange(year?: number, month?: number) {
    const now = new Date();
    const y = Number.isFinite(year) ? Number(year) : now.getFullYear();
    const m = Number.isFinite(month) ? Number(month) : now.getMonth() + 1; // 1-12
    if (m < 1 || m > 12) throw new Error('Invalid month. Use 1-12.');
    const start = startOfMonth(new Date(y, m - 1, 1));
    const end = endOfMonth(start);
    const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    return { start, end, label };
  }

  private async collectStallPayments(from: Date, to: Date, method?: PaymentMethod) {
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
          ...(method ? { paymentMethod: method } : {}),
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
      count: paidTransactions.length + (method && method !== 'CASH' ? 0 : manualAttendances.length),
      revenue: this.sumTransactions(paidTransactions) + (method && method !== 'CASH' ? 0 : this.sumAttendances(manualAttendances)),
    };
  }

  private toTashkentDate(value: Date | string | number) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    // Shift to Tashkent by aligning to +05:00 in ISO string
    const iso = d.toISOString();
    return new Date(iso.replace('Z', '+05:00'));
  }

  private async collectStorePayments(from: Date, to: Date, method?: PaymentMethod) {
    const storePayments = await this.prisma.transaction.findMany({
      where: {
        contract: { isActive: true },
        createdAt: { gte: from, lte: to },
        status: 'PAID',
        ...(method ? { paymentMethod: method } : {}),
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

  async getMonthlyStatisticsFor(month: number, year: number, type?: EntityType) {
    const { start, end, label } = this.monthRange(year, month);
    const stallResult = !type || type === 'stall'
      ? await this.collectStallPayments(start, end)
      : { count: 0, revenue: 0 };

    const storeResult = !type || type === 'store'
      ? await this.collectStorePayments(start, end)
      : { count: 0, revenue: 0 };

    return {
      month: label,
      count: stallResult.count + storeResult.count,
      revenue: stallResult.revenue + storeResult.revenue,
      stall: stallResult,
      store: storeResult,
    };
  }

  async getMonthlyDetails(month: number, year: number, type?: EntityType) {
    const { start, end, label } = this.monthRange(year, month);

    const stallAll = !type || type === 'stall'
      ? await this.collectStallPayments(start, end)
      : { count: 0, revenue: 0 };
    const storeAll = !type || type === 'store'
      ? await this.collectStorePayments(start, end)
      : { count: 0, revenue: 0 };

    // Payment method breakdown (manual stall payments counted as CASH)
    const methods: Record<PaymentMethod, { count: number; revenue: number }> = {
      CASH: { count: 0, revenue: 0 },
      PAYME: { count: 0, revenue: 0 },
      CLICK: { count: 0, revenue: 0 },
    };
    for (const method of ['CASH', 'PAYME', 'CLICK'] as PaymentMethod[]) {
      const stall = !type || type === 'stall' ? await this.collectStallPayments(start, end, method) : { count: 0, revenue: 0 };
      const store = !type || type === 'store' ? await this.collectStorePayments(start, end, method) : { count: 0, revenue: 0 };
      methods[method] = {
        count: stall.count + store.count,
        revenue: stall.revenue + store.revenue,
      };
    }

    return {
      month: label,
      totals: {
        count: stallAll.count + storeAll.count,
        revenue: stallAll.revenue + storeAll.revenue,
      },
      stall: stallAll,
      store: storeAll,
      methods,
    };
  }

  async getRecentMonthlySeries(params: { months?: number; type?: 'stall' | 'store' | 'all'; method?: PaymentMethod }) {
    const months = Math.min(36, Math.max(1, Number(params.months) || 12));
    const now = new Date();
    const buckets: { label: string; start: Date; end: Date }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const { start, end, label } = this.monthRange(d.getFullYear(), d.getMonth() + 1);
      buckets.push({ label, start, end });
    }

    const labels = buckets.map((b) => b.label);
    const stallSeries = new Array(months).fill(0);
    const storeSeries = new Array(months).fill(0);

    const doStall = params.type === 'stall' || params.type === 'all' || !params.type;
    const doStore = params.type === 'store' || params.type === 'all' || !params.type;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (doStall) {
        const res = await this.collectStallPayments(bucket.start, bucket.end, params.method);
        stallSeries[i] = res.revenue;
      }
      if (doStore) {
        const res = await this.collectStorePayments(bucket.start, bucket.end, params.method);
        storeSeries[i] = res.revenue;
      }
    }

    const series: any[] = [];
    if (doStall) series.push({ key: 'stall', data: stallSeries });
    if (doStore) series.push({ key: 'store', data: storeSeries });
    return { labels, series };
  }

  async getTotals(params: { from?: string; to?: string; type?: 'stall' | 'store' | 'all'; method?: 'PAYME' | 'CLICK' | 'CASH'; status?: string; }) {
    const { from, to } = this.normalizeRange(params.from, params.to);
    const type = params.type === 'stall' || params.type === 'store' ? params.type : 'all';
    const status = params.status || 'PAID';

    const doStall = type === 'stall' || type === 'all';
    const doStore = type === 'store' || type === 'all';

    const stallResult = doStall ? await this.collectStallPayments(from, to) : { count: 0, revenue: 0 };
    const whereTx: any = {
      createdAt: { gte: from, lte: to },
      status,
    };
    if (params.method) whereTx.paymentMethod = params.method;
    const storeResult = doStore
      ? {
          count: await this.prisma.transaction.count({ where: { ...whereTx, contractId: { not: null } } }),
          revenue: this.sumTransactions(await this.prisma.transaction.findMany({ where: { ...whereTx, contractId: { not: null } } })),
        }
      : { count: 0, revenue: 0 };

    return { count: stallResult.count + storeResult.count, revenue: stallResult.revenue + storeResult.revenue };
  }

  async getSeries(params: { from?: string; to?: string; groupBy?: 'daily' | 'weekly' | 'monthly'; type?: 'stall' | 'store' | 'all'; method?: 'PAYME' | 'CLICK' | 'CASH'; status?: string; }) {
    const { from, to } = this.normalizeRange(params.from, params.to);
    const type = params.type === 'stall' || params.type === 'store' ? params.type : 'all';
    const status = params.status || 'PAID';
    const groupBy = params.groupBy || 'daily';

    // build buckets
    const labels: string[] = [];
    const buckets: Date[] = [];
    const cursor = new Date(from);
    const end = new Date(to);
    const fmt = (d: Date) => d.toISOString();
    if (groupBy === 'monthly') {
      let c = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      while (c <= end) {
        labels.push(`${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`);
        buckets.push(new Date(c));
        c = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      }
    } else if (groupBy === 'weekly') {
      let c = startOfDay(cursor);
      while (c <= end) {
        labels.push(fmt(c));
        buckets.push(new Date(c));
        c = new Date(c.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    } else {
      let c = startOfDay(cursor);
      while (c <= end) {
        labels.push(fmt(c));
        buckets.push(new Date(c));
        c = new Date(c.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const init = new Array(labels.length).fill(0);
    const stallSeries = init.slice();
    const storeSeries = init.slice();

    // Load data
    const doStall = type === 'stall' || type === 'all';
    const doStore = type === 'store' || type === 'all';

    let attendances: Attendance[] = [];
    if (doStall) {
      attendances = await this.prisma.attendance.findMany({
        where: { date: { gte: from, lte: to }, status: status as any },
      });
    }
    let transactions: Transaction[] = [];
    if (doStore) {
      const whereTx: any = { createdAt: { gte: from, lte: to }, status };
      if (params.method) whereTx.paymentMethod = params.method;
      transactions = await this.prisma.transaction.findMany({ where: { ...whereTx, contractId: { not: null } } });
    }

    const findIndex = (d: Date) => {
      if (groupBy === 'monthly') {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return labels.indexOf(key);
      }
      if (groupBy === 'weekly') {
        // align to the start bucket boundaries we produced
        const t = startOfDay(d);
        // find last bucket <= date
        let idx = -1;
        for (let i = 0; i < buckets.length; i++) {
          if (buckets[i] <= t) idx = i; else break;
        }
        return idx;
      }
      const key = fmt(startOfDay(d));
      return labels.indexOf(key);
    };

    if (doStall) {
      for (const a of attendances) {
        const idx = findIndex(new Date(a.date));
        if (idx >= 0) stallSeries[idx] += this.decimalToNumber(a.amount);
      }
    }
    if (doStore) {
      for (const t of transactions) {
        const d = t.createdAt ? new Date(t.createdAt) : null as any;
        if (!d) continue;
        const idx = findIndex(d);
        if (idx >= 0) storeSeries[idx] += this.decimalToNumber(t.amount as any);
      }
    }

    const series: any[] = [];
    if (doStall) series.push({ key: 'stall', data: stallSeries });
    if (doStore) series.push({ key: 'store', data: storeSeries });
    return { labels, series };
  }

  async getReconciliationLedger(params: {
    from?: string;
    to?: string;
    month?: number;
    year?: number;
    type?: 'stall' | 'store' | 'all';
    method?: PaymentMethod;
    status?: TxStatus | 'all';
    sectionId?: number;
    contractId?: number;
    stallId?: number;
  }) {
    const range = params.month && params.year
      ? this.monthRange(params.year, params.month)
      : this.normalizeRange(params.from, params.to);
    const { start, end } = (range as any).start ? (range as any) : { start: (range as any).from, end: (range as any).to };
    const doStall = !params.type || params.type === 'all' || params.type === 'stall';
    const doStore = !params.type || params.type === 'all' || params.type === 'store';
    const statusFilter = params.status && params.status !== 'all' ? params.status : null;
    const methodFilter = params.method || null;

    const rows: any[] = [];

    if (doStall) {
      const attendances = await this.prisma.attendance.findMany({
        where: {
          date: { gte: start, lte: end },
          ...(statusFilter ? { status: statusFilter as any } : {}),
          ...(params.stallId ? { stallId: params.stallId } : {}),
          ...(params.sectionId ? { Stall: { sectionId: params.sectionId } } : {}),
        },
        include: {
          transaction: true,
          Stall: { include: { Section: true } },
        },
      });
      for (const a of attendances) {
        const method = (a.transaction?.paymentMethod as PaymentMethod) || 'CASH';
        if (methodFilter && method !== methodFilter) continue;
        const status = (a.transaction?.status as any) || a.status;
        rows.push({
          date: this.toTashkentDate(a.date),
          type: 'stall',
          stallId: a.stallId,
          stallNumber: a.Stall?.stallNumber ?? null,
          sectionId: a.Stall?.sectionId ?? null,
          sectionName: a.Stall?.Section?.name ?? null,
          amount: this.decimalToNumber(a.transaction?.amount ?? a.amount),
          status,
          method,
          source: 'attendance',
          id: a.id,
          transactionId: a.transactionId,
          paidAt: this.toTashkentDate(a.transaction?.createdAt ?? a.date),
          note: a.transaction ? undefined : 'Manual',
        });
      }
    }

    if (doStore) {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          contractId: { not: null },
          createdAt: { gte: start, lte: end },
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(methodFilter ? { paymentMethod: methodFilter } : {}),
          ...(params.contractId ? { contractId: params.contractId } : {}),
          ...(params.sectionId ? { contract: { store: { sectionId: params.sectionId } } } : {}),
        },
        include: {
          contract: {
            include: {
              store: { include: { Section: true } },
              owner: true,
            },
          },
        },
      });
      for (const t of transactions) {
        rows.push({
          date: this.toTashkentDate(t.createdAt),
          type: 'store',
          contractId: t.contractId,
          storeId: t.contract?.storeId ?? null,
          storeNumber: t.contract?.store?.storeNumber ?? null,
          sectionId: t.contract?.store?.sectionId ?? null,
          sectionName: t.contract?.store?.Section?.name ?? null,
          owner: t.contract?.owner?.fullName ?? null,
          amount: this.decimalToNumber(t.amount),
          status: t.status,
          method: t.paymentMethod as PaymentMethod,
          source: 'transaction',
          id: t.id,
          transactionId: t.transactionId,
          paidAt: this.toTashkentDate(t.createdAt),
        });
      }
    }

    rows.sort((a, b) => {
      const aTime = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bTime = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return bTime - aTime;
    });

    return {
      from: start,
      to: end,
      timeZone: 'Asia/Tashkent',
      count: rows.length,
      rows,
    };
  }

  async getReconciliationContractSummary(params: {
    from?: string;
    to?: string;
    month?: number;
    year?: number;
    method?: PaymentMethod;
    status?: TxStatus | 'all';
    sectionId?: number;
  }) {
    const range = params.month && params.year
      ? this.monthRange(params.year, params.month)
      : this.normalizeRange(params.from, params.to);
    const { start, end } = (range as any).start ? (range as any) : { start: (range as any).from, end: (range as any).to };
    const statusFilter = params.status && params.status !== 'all' ? params.status : null;
    const methodFilter = params.method || null;

    const contracts = await this.prisma.contract.findMany({
      where: {
        ...(params.sectionId ? { store: { sectionId: params.sectionId } } : {}),
      },
      include: {
        store: { include: { Section: true } },
        owner: true,
        transactions: {
          where: {
            createdAt: { gte: start, lte: end },
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(methodFilter ? { paymentMethod: methodFilter } : {}),
          },
        },
      },
    });

    const summary = contracts.map((contract) => {
      const expected = this.decimalToNumber(contract.shopMonthlyFee);
      const paidTx = contract.transactions.filter((t) => t.status === 'PAID');
      const paid = this.sumTransactions(paidTx as any);
      const unpaid = Math.max(0, expected - paid);
      // Overpayment rule: more than one full month's fee paid within the selected month
      const overpaid = expected > 0 && paid > expected * 1.01;
      const lastPayment = contract.transactions.slice().sort((a, b) => {
        const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bt - at;
      })[0];
      const methodCounts = contract.transactions.reduce(
        (acc, tx) => {
          const key = (tx.paymentMethod as PaymentMethod) || 'CASH';
          acc[key] = (acc[key] || 0) + this.decimalToNumber(tx.amount);
          return acc;
        },
        {} as Record<PaymentMethod, number>,
      );
      return {
        contractId: contract.id,
        storeNumber: contract.store?.storeNumber || `#${contract.storeId}`,
        sectionName: contract.store?.Section?.name || null,
        owner: contract.owner?.fullName || null,
        expected,
        paid,
        unpaid,
        overpaid,
        paymentsCount: contract.transactions.length,
        paidCount: paidTx.length,
        pendingCount: contract.transactions.filter((t) => t.status === 'PENDING').length,
        failedCount: contract.transactions.filter((t) => t.status === 'FAILED' || t.status === 'CANCELLED').length,
        lastPaymentAt: lastPayment?.createdAt || null,
        lastPaymentMethod: lastPayment?.paymentMethod || null,
        methods: methodCounts,
      };
    });

    return { from: start, to: end, timeZone: 'Asia/Tashkent', summary };
  }

  async getReconciliationMonthlyRollup(params: {
    months?: number;
    type?: 'stall' | 'store' | 'all';
    method?: PaymentMethod;
    status?: TxStatus | 'all';
  }) {
    const months = Math.min(24, Math.max(1, Number(params.months) || 12));
    const now = new Date();
    const labels: string[] = [];
    const stallSeries: number[] = [];
    const storeSeries: number[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const { start, end, label } = this.monthRange(d.getFullYear(), d.getMonth() + 1);
      labels.push(label);
      const ledger = await this.getReconciliationLedger({
        from: start.toISOString(),
        to: end.toISOString(),
        type: params.type || 'all',
        method: params.method,
        status: params.status,
      });
      stallSeries.push(
        ledger.rows.filter((r) => r.type === 'stall').reduce((sum, r) => sum + this.decimalToNumber(r.amount), 0),
      );
      storeSeries.push(
        ledger.rows.filter((r) => r.type === 'store').reduce((sum, r) => sum + this.decimalToNumber(r.amount), 0),
      );
    }
    const series: any[] = [];
    if (params.type !== 'stall') series.push({ key: 'store', data: storeSeries });
    if (params.type !== 'store') series.push({ key: 'stall', data: stallSeries });
    return { labels, series };
  }
}
