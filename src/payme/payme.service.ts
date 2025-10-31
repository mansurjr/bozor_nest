import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Transaction } from '@prisma/client';
import { TransactionMethods } from './constants/transaction-methods';
import { CheckPerformTransactionDto } from './dto/check-perform-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { PerformTransactionDto } from './dto/perform-transaction.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { CheckTransactionDto } from './dto/check-transaction.dto';
import { GetStatementDto } from './dto/get-statement.dto';
import { ErrorStatusCodes } from './constants/error-status-codes';
import { PaymeError } from './constants/payme-error';
import { TransactionState } from './constants/transaction-state';
import { CancelingReasons } from './constants/canceling-reasons';
import { RequestBody } from './dto/incominBody';
import { DateTime } from 'luxon';

@Injectable()
export class PaymeService {
  constructor(private readonly prisma: PrismaService) { }

  async handleTransactionMethods(reqBody: RequestBody) {
    switch (reqBody.method) {
      case TransactionMethods.CheckPerformTransaction:
        return this.checkPerformTransaction(reqBody as CheckPerformTransactionDto);
      case TransactionMethods.CreateTransaction:
        return this.createTransaction(reqBody as CreateTransactionDto);
      case TransactionMethods.PerformTransaction:
        return this.performTransaction(reqBody as PerformTransactionDto);
      case TransactionMethods.CancelTransaction:
        return this.cancelTransaction(reqBody as CancelTransactionDto);
      case TransactionMethods.CheckTransaction:
        return this.checkTransaction(reqBody as CheckTransactionDto);
      case TransactionMethods.GetStatement:
        return this.getStatement(reqBody as GetStatementDto);
      default:
        return { error: 'Invalid transaction method' };
    }
  }

  // ============================= CHECK PERFORM TRANSACTION =============================

  async checkPerformTransaction(dto: CheckPerformTransactionDto) {
    const account = dto.params.account;
    const transId = account.attendanceId || account.contractId; // storeNumber instead of contractId
    const amount = new Prisma.Decimal(dto.params.amount);

    if (!transId) {
      return {
        error: {
          code: ErrorStatusCodes.TransactionNotAllowed,
          message: {
            uz: 'Hisob ma’lumotlari topilmadi',
            en: 'Account information not found',
            ru: 'Информация об аккаунте не найдена',
          },
          data: null,
        },
      };
    }

    let transaction: Transaction;

    // ================= DAILY ATTENDANCE PAYMENT =================
    if (account.attendanceId) {
      const attendanceId = Number(account.attendanceId);
      const attendance = await this.prisma.attendance.findUnique({
        where: { id: attendanceId },
      });

      if (!attendance) {
        return {
          error: {
            code: ErrorStatusCodes.TransactionNotFound,
            message: {
              uz: 'Attendance topilmadi',
              en: 'Attendance not found',
              ru: 'Посещаемость не найдена',
            },
          },
        };
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const existing = await this.prisma.transaction.findFirst({
        where: {
          attendanceId: attendance.id,
          status: 'PAID',
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });

      if (existing) {
        return {
          error: {
            code: ErrorStatusCodes.TransactionNotAllowed,
            message: {
              uz: 'Bugungi kun uchun allaqachon to‘lov amalga oshirilgan',
              en: 'Payment has already been made for today',
              ru: 'Оплата за сегодняшний день уже была произведена',
            },
            data: null,
          },
        };
      }

      transaction = await this.prisma.transaction.create({
        data: {
          transactionId: `DAILY-${attendance.id}-${Date.now()}`,
          amount: attendance.amount ?? new Prisma.Decimal(0),
          status: 'PENDING',
          paymentMethod: 'PAYME',
          attendance: { connect: { id: attendance.id } },
        },
      });
    }

    // ================= MONTHLY STORE PAYMENT =================
    else if (account.contractId) {
      const storeNumber = account.contractId;

      const store = await this.prisma.store.findFirst({
        where: { storeNumber },
        include: { contracts: true },
      });

      if (!store) {
        return {
          error: {
            code: ErrorStatusCodes.TransactionNotFound,
            message: {
              uz: 'Do‘kon topilmadi',
              en: 'Store not found',
              ru: 'Магазин не найден',
            },
          },
        };
      }

      const contract =
        store.contracts?.find((c: any) => c.isActive) ??
        store.contracts?.[0];

      if (!contract || !contract.isActive) {
        return {
          error: {
            code: ErrorStatusCodes.TransactionNotAllowed,
            message: {
              uz: 'Faol shartnoma topilmadi',
              en: 'No active contract found for this store',
              ru: 'Активный договор для этого магазина не найден',
            },
            data: null,
          },
        };
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(startOfMonth.getMonth() + 1);
      endOfMonth.setMilliseconds(-1);

      const existingMonthly = await this.prisma.transaction.findFirst({
        where: {
          contractId: contract.id,
          status: 'PAID',
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      if (existingMonthly) {
        return {
          error: {
            code: ErrorStatusCodes.TransactionNotAllowed,
            message: {
              uz: 'Ushbu oy uchun allaqachon to‘lov amalga oshirilgan',
              en: 'Payment has already been made for this month',
              ru: 'Оплата за этот месяц уже была произведена',
            },
            data: null,
          },
        };
      }

      transaction = await this.prisma.transaction.create({
        data: {
          transactionId: `MONTHLY-${store.storeNumber}-${Date.now()}`,
          amount: contract.shopMonthlyFee ?? new Prisma.Decimal(0),
          status: 'PENDING',
          paymentMethod: 'PAYME',
          contract: { connect: { id: contract.id } },
        },
      });
    } else {
      return {
        error: {
          code: ErrorStatusCodes.TransactionNotAllowed,
          message: {
            uz: 'Hisob ma’lumotlari yetarli emas',
            en: 'Insufficient account information',
            ru: 'Недостаточно данных об аккаунте',
          },
          data: null,
        },
      };
    }

    // ================= AMOUNT VALIDATION =================
    if (!transaction.amount.equals(amount)) {
      return {
        error: {
          code: ErrorStatusCodes.InvalidAmount,
          message: {
            uz: 'To‘lov summasi noto‘g‘ri',
            en: 'Invalid payment amount',
            ru: 'Неверная сумма платежа',
          },
          data: null,
        },
      };
    }

    // ✅ SUCCESS
    return { result: { allow: true } };
  }


  // ============================= CREATE TRANSACTION =============================

  async createTransaction(dto: CreateTransactionDto) {
    const checkResult = await this.checkPerformTransaction({
      method: TransactionMethods.CheckPerformTransaction,
      params: dto.params,
    } as CheckPerformTransactionDto);

    if (checkResult.error) return { error: checkResult.error, id: dto.params.id };

    const newTransaction = await this.prisma.transaction.create({
      data: {
        transactionId: dto.params.id,
        amount: new Prisma.Decimal(dto.params.amount),
        status: 'PENDING',
        paymentMethod: 'PAYME',
      },
    });

    return {
      result: {
        transaction: newTransaction.id,
        state: TransactionState.Pending,
        create_time: newTransaction.createdAt.getTime(),
      },
    };
  }

  // ============================= PERFORM TRANSACTION =============================

  async performTransaction(dto: PerformTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId: dto.params.id },
      include: { attendance: true, contract: true },
    });

    if (!transaction)
      return { error: PaymeError.TransactionNotFound, id: dto.params.id };

    if (transaction.status === 'PAID') {
      return {
        result: {
          state: TransactionState.Paid,
          perform_time: transaction.updatedAt.getTime(),
        },
      };
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'PAID' },
    });

    if (transaction.attendanceId) {
      await this.prisma.attendance.update({
        where: { id: transaction.attendanceId },
        data: { status: 'PAID' },
      });
    }

    return {
      result: {
        state: TransactionState.Paid,
        perform_time: new Date().getTime(),
      },
    };
  }

  // ============================= CANCEL TRANSACTION =============================

  async cancelTransaction(dto: CancelTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId: dto.params.id },
    });

    if (!transaction)
      return { id: dto.params.id, error: PaymeError.TransactionNotFound };

    const updated = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'CANCELED',
        updatedAt: new Date(),
      },
    });

    return {
      result: {
        state: TransactionState.PendingCanceled,
        cancel_time: updated.updatedAt.getTime(),
      },
    };
  }

  // ============================= CHECK TRANSACTION =============================

  async checkTransaction(dto: CheckTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { transactionId: dto.params.id },
    });

    if (!transaction)
      return { error: PaymeError.TransactionNotFound, id: dto.params.id };

    return {
      result: {
        create_time: transaction.createdAt.getTime(),
        perform_time: transaction.updatedAt.getTime(),
        transaction: transaction.id,
        state: transaction.status === 'PAID' ? TransactionState.Paid : TransactionState.Pending,
      },
    };
  }

  // ============================= GET STATEMENT =============================

  async getStatement(dto: GetStatementDto) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: new Date(dto.params.from),
          lte: new Date(dto.params.to),
        },
        paymentMethod: 'PAYME',
      },
    });

    return {
      result: {
        transactions: transactions.map((t) => ({
          id: t.transactionId,
          time: t.createdAt.getTime(),
          amount: t.amount,
          create_time: t.createdAt.getTime(),
          perform_time: t.updatedAt.getTime(),
          state: t.status,
        })),
      },
    };
  }
}
