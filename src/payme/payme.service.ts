import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionMethods } from "./types";
import { CheckPerformTransactionDto } from "./dto/check-perform-transaction.dto";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { PerformTransactionDto } from "./dto/perform-transaction.dto";
import { CheckTransactionDto } from "./dto/check-transaction.dto";
import { CancelTransactionDto } from "./dto/cancel-transaction.dto";
import { GetStatementDto } from "./dto/get-statement.dto";
import { PaymeError } from "../common/types/payme-error";
import { Attendance, AttendancePayment, Prisma, Store } from "@prisma/client";
import { checkAttendance, checkStore } from "./utils";
import { DateTime } from "luxon";
import { ContractPaymentPeriodsService } from "../contract/contract-payment.service";
import { ConfigService } from "@nestjs/config";
import * as base64 from "base-64";
import { NotFoundException } from "@nestjs/common";

type CheckResult =
  | { error: { code: number; message: { ru: string; en: string; uz: string } }; data: null }
  | { result: { allow: boolean } };

@Injectable()
export class PaymeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractPayments: ContractPaymentPeriodsService,
    private readonly config: ConfigService,
  ) {}

  async handleTransactionMethods(reqBody: any) {
    switch (reqBody.method) {
      case TransactionMethods.CheckPerformTransaction:
        return this.checkPerformTransaction(reqBody as CheckPerformTransactionDto);
      case TransactionMethods.CreateTransaction:
        return this.createTransaction(reqBody as CreateTransactionDto);
      case TransactionMethods.PerformTransaction:
        return this.performTransaction(reqBody as PerformTransactionDto);
      case TransactionMethods.CheckTransaction:
        return this.checkTransaction(reqBody as CheckTransactionDto);
      case TransactionMethods.CancelTransaction:
        return this.cancelTransaction(reqBody as CancelTransactionDto);
      case TransactionMethods.GetStatement:
        return this.getStatement(reqBody as GetStatementDto);
      default:
        return "Invalid transaction method";
    }
  }

  private checkTransactionExpiration(createdAt: Date) {
    const timeoutMinutes = 720; // 12 hours
    const expirationDate = DateTime.now().minus({ minutes: timeoutMinutes }).toJSDate();
    return createdAt < expirationDate;
  }

  async checkPerformTransaction(reqBody: CheckPerformTransactionDto): Promise<CheckResult> {
    const { amount, account } = reqBody.params;
    const attendanceId = account.attendanceId ? +account.attendanceId : 0;
    const contractId = account.contractId && account.contractId !== "null" ? account.contractId : "";

    if (contractId) {
      const { store, contract, paidOrIsNotActive } = await checkStore(this.prisma, contractId);
      if (!store || (paidOrIsNotActive && !contractId.startsWith('TX_'))) {
        return { error: PaymeError.AlreadyDone, data: null };
      }

      // If it's a specific payment intent (TX_ prefix), validate against the intent transaction amount
      if (contractId.startsWith('TX_')) {
        const txId = parseInt(contractId.split('_')[1]);
        const intentTx = await this.prisma.transaction.findUnique({ where: { id: txId } });
        if (!intentTx) return { error: PaymeError.TransactionNotFound, data: null };
        if (intentTx.status === 'PAID') return { error: PaymeError.AlreadyDone, data: null };
        
        if (amount && Math.abs(Number(amount) - Number(intentTx.amount) * 100) > 0.01) {
          console.log(`[checkPerformTransaction] ❌ Amount mismatch for TX intent ${contractId}: incoming=${amount}, expected=${Number(intentTx.amount) * 100}`);
          return { error: PaymeError.InvalidAmount, data: null };
        }
        return { result: { allow: true } };
      }

      // Accept exact integer multiples up to 12 months for contracts (Regular storeNumber flow)
      try {
        const fee = Number(contract?.shopMonthlyFee ?? 0);
        const incoming = Number(amount ?? 0);
        if (fee > 0 && Number.isFinite(fee) && Number.isFinite(incoming)) {
          const months = incoming / (fee * 100);
          if (Math.abs(months - Math.floor(months)) < 1e-9 && months >= 1 && months <= 12) {
            return { result: { allow: true } };
          }
        }
      } catch {}

      console.log(`[checkPerformTransaction] Incoming amount: ${amount}, Expected: ${contract?.shopMonthlyFee}`);

      if (amount && Number(amount) !== Number(contract?.shopMonthlyFee) * 100) {
        console.log(`[checkPerformTransaction] ❌ Amount mismatch for contractId=${contractId}`);
        return { error: PaymeError.InvalidAmount, data: null };
      }
    } else if (attendanceId) {
      const { attendance, alreadyPaid } = await checkAttendance(this.prisma, attendanceId);
      if (!attendance || alreadyPaid) {
        return { error: PaymeError.AlreadyDone, data: null };
      }

      console.log(`[checkPerformTransaction] Incoming amount: ${amount}, Expected: ${attendance.amount}`);

      if (amount && Number(amount) !== Number(attendance.amount) * 100) {
        console.log(`[checkPerformTransaction] ❌ Amount mismatch for attendanceId=${attendanceId}`);
        return { error: PaymeError.InvalidAmount, data: null };
      }
    } else {
      return {
        error: {
          code: -31060,
          message: {
            ru: "Отсутствует информация по аккаунту",
            en: "Account information missing",
            uz: "Hisob ma’lumotlari topilmadi",
          },
        },
        data: null,
      };
    }

    return { result: { allow: true } };
  }

  async createTransaction(reqBody: CreateTransactionDto) {
    const { id, amount, account } = reqBody.params;
    const attendanceId = account.attendanceId ? +account.attendanceId : 0;
    const contractId = account.contractId && account.contractId !== "null" ? account.contractId : "";

    let entityAmount: number;
    let globStore: Store | null = null;
    let globAttendance: Attendance | null = null;
    let contractIdNum: number | undefined;
    let intentId: number | undefined;

    if (contractId) {
      const { store, contract, paidOrIsNotActive } = await checkStore(this.prisma, contractId);
      if (!store || (paidOrIsNotActive && !contractId.startsWith('TX_'))) return { error: PaymeError.AlreadyDone, data: null };
      
      globStore = store;
      contractIdNum = contract?.id;

      if (contractId.startsWith('TX_')) {
        intentId = parseInt(contractId.split('_')[1]);
        const intentTx = await this.prisma.transaction.findUnique({ where: { id: intentId } });
        if (!intentTx) return { error: PaymeError.TransactionNotFound, data: null };
        entityAmount = Number(intentTx.amount);
      } else {
        entityAmount = Number(contract?.shopMonthlyFee);

        // If incoming equals an exact integer multiple (1..12) of monthly fee, scale entityAmount accordingly
        try {
          const fee = entityAmount;
          const incoming = Number(amount ?? 0);
          if (fee > 0 && Number.isFinite(fee) && Number.isFinite(incoming)) {
            const months = incoming / (fee * 100);
            if (Math.abs(months - Math.floor(months)) < 1e-9 && months >= 1 && months <= 12) {
              entityAmount = fee * Math.floor(months);
            }
          }
        } catch {}
      }

      console.log(`[createTransaction] Contract: incoming=${amount}, expected(total)=${entityAmount}`);

      // Cancel other pending transactions for this contract
      await this.prisma.transaction.updateMany({
        where: {
          contractId: contractIdNum,
          status: 'PENDING',
          id: { not: intentId || -1 }, // Don't cancel the current intent if we are using one
        },
        data: {
          status: 'CANCELED',
          state: -1,
          cancelTime: new Date(),
          reason: 1, // Cancelled by system for new payment
        },
      });
    } else if (attendanceId) {
      const { attendance, alreadyPaid } = await checkAttendance(this.prisma, attendanceId);
      if (!attendance || alreadyPaid) return { error: PaymeError.AlreadyDone, data: null };
      globAttendance = attendance;
      entityAmount = Number(attendance.amount);

      console.log(`[createTransaction] Attendance: incoming=${amount}, expected=${entityAmount}`);

      const existingAttendanceTransaction = await this.prisma.transaction.findFirst({
        where: { attendanceId, status: { not: "CANCELED" } },
        orderBy: { createdAt: "desc" },
      });

      if (existingAttendanceTransaction) {
        if (existingAttendanceTransaction.transactionId.toString() === id.toString()) {
          return {
            result: {
              transaction: existingAttendanceTransaction.transactionId.toString(),
              state: existingAttendanceTransaction.state ?? 1,
              create_time: existingAttendanceTransaction.createdAt.getTime(),
            },
          };
        }
        return {
          error: {
            code: -31099,
            message: {
              ru: "Для данного посещения уже существует активная транзакция",
              en: "An active transaction already exists for this attendance",
              uz: "Ushbu qatnashuv uchun faol tranzaksiya allaqachon mavjud",
            },
          },
          data: null,
        };
      }
    } else {
      return {
        error: {
          code: -31060,
          message: {
            ru: "Отсутствует информация по аккаунту",
            en: "Account information missing",
            uz: "Hisob ma’lumotlari topilmadi",
          },
        },
        data: null,
      };
    }

    // Validate incoming Payme amount (should equal DB amount ×100)
    if (amount && Number(amount) !== entityAmount * 100) {
      console.log(`[createTransaction] ❌ Amount mismatch for id=${id}: incoming=${amount}, expected=${entityAmount * 100}`);
      return { error: PaymeError.InvalidAmount, data: null };
    }

    const existingTransaction = await this.prisma.transaction.findUnique({ where: { transactionId: id } });
    if (existingTransaction) {
      if (existingTransaction.status !== "PENDING") return { error: PaymeError.CantDoOperation, id };
      if (this.checkTransactionExpiration(existingTransaction.createdAt)) {
        await this.prisma.transaction.update({
          where: { id: existingTransaction.id },
          data: { status: "CANCELED", cancelTime: new Date(), state: -1, reason: 4 },
        });
        return { error: { ...PaymeError.CantDoOperation, state: -1, reason: 4 }, id };
      }
      return {
        result: {
          transaction: existingTransaction.transactionId.toString(),
          state: 1,
          create_time: existingTransaction.createdAt.getTime(),
        },
      };
    }

    // Perform check
    const checkTransaction: CheckPerformTransactionDto = {
      method: TransactionMethods.CheckPerformTransaction,
      params: { amount: entityAmount * 100, account: { contractId: contractId || "", attendanceId: attendanceId || 0, id: 1 } },
    };
    const checkResult = await this.checkPerformTransaction(checkTransaction);
    if ("error" in checkResult) return { error: checkResult.error, id };

    const newTransaction = await this.prisma.transaction.create({
      data: {
        transactionId: id,
        amount: new Prisma.Decimal(entityAmount), // store in sums, not tiyin
        status: "PENDING",
        paymentMethod: "PAYME",
        performTime: null,
        cancelTime: null,
        state: 1,
        reason: null,
        prepareId: intentId,
        contract: contractIdNum ? { connect: { id: contractIdNum } } : undefined,
        attendance: globAttendance ? { connect: { id: globAttendance.id } } : undefined,
      },
    });

    console.log(`[createTransaction] ✅ Transaction created successfully: id=${id}, amount=${entityAmount}`);

    return {
      result: {
        transaction: newTransaction.transactionId.toString(),
        state: newTransaction.state,
        create_time: newTransaction.createdAt.getTime(),
      },
    };
  }

  async performTransaction(reqBody: PerformTransactionDto) {
    const { id } = reqBody.params;
    const transaction = await this.prisma.transaction.findUnique({ where: { transactionId: id } });

    if (!transaction) return { error: PaymeError.TransactionNotFound, id };
    if (transaction.status !== "PENDING") {
      if (transaction.status !== "PAID") return { error: PaymeError.CantDoOperation, id };
      return {
        result: {
          transaction: transaction.transactionId.toString(),
          perform_time: transaction.performTime?.getTime() || 0,
          state: transaction.state ?? 2,
        },
      };
    }

    if (this.checkTransactionExpiration(transaction.createdAt)) {
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "CANCELED", cancelTime: new Date(), state: -1, reason: 4 },
      });
      return { error: { ...PaymeError.CantDoOperation, state: -1, reason: 4 }, id };
    }

    const updatedTransaction = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "PAID", state: 2, performTime: new Date() },
    });

    if (updatedTransaction.contractId) {
      let forcedStart: Date | undefined;
      let forcedMonths: number | undefined;

      // If we have a parent intent (via TX_ account flow), try to extract parameters
      if (updatedTransaction.prepareId) {
        const intentTx = await this.prisma.transaction.findUnique({ where: { id: updatedTransaction.prepareId } });
        if (intentTx && intentTx.transactionId.startsWith('INTENT:')) {
          const parts = intentTx.transactionId.split(':');
          // Format: INTENT:contractId:count:startMonth:timestamp
          
          if (parts[2]) {
             forcedMonths = parseInt(parts[2]);
          }

          if (parts[3] && parts[3].length === 7) {
            forcedStart = new Date(parts[3] + '-01');
          }
          // Mark the parent intent as fulfilled (use FULFILLED to distinguish from the actual money-carrying transaction)
          await this.prisma.transaction.update({
            where: { id: updatedTransaction.prepareId },
            data: { status: 'FULFILLED' },
          });
        }
      }
      await this.contractPayments.recordPaidTransaction(updatedTransaction.id, forcedStart, forcedMonths);
    }

    if (updatedTransaction.attendanceId) {
      await this.prisma.attendance.update({
        where: { id: updatedTransaction.attendanceId },
        data: { status: AttendancePayment.PAID, transactionId: updatedTransaction.id },
      });
    }

    console.log(`[performTransaction] ✅ Transaction performed successfully: id=${id}`);

    return {
      result: {
        transaction: updatedTransaction.transactionId.toString(),
        perform_time: updatedTransaction.performTime!.getTime(),
        state: updatedTransaction.state,
      },
    };
  }

  async checkTransaction(reqBody: CheckTransactionDto) {
    const { id } = reqBody.params;
    const transaction = await this.prisma.transaction.findUnique({ where: { transactionId: id } });
    if (!transaction) return { error: PaymeError.TransactionNotFound, id };

    return {
      result: {
        create_time: transaction.createdAt.getTime(),
        perform_time: transaction.performTime?.getTime() || 0,
        cancel_time: transaction.cancelTime?.getTime() || 0,
        transaction: transaction.transactionId.toString(),
        state: transaction.state ?? 1,
        reason: transaction.reason ?? null,
      },
    };
  }

  async cancelTransaction(reqBody: CancelTransactionDto) {
    const transId = reqBody.params.id;
    const transaction = await this.prisma.transaction.findUnique({ where: { transactionId: transId } });
    if (!transaction) return { id: transId, error: PaymeError.TransactionNotFound };

    if (transaction.status === "PENDING") {
      const canceled = await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: "CANCELED", state: -1, cancelTime: new Date(), reason: reqBody.params.reason || 0 },
      });
      console.log(`[cancelTransaction] Transaction canceled: id=${transId}`);
      return {
        result: {
          cancel_time: canceled.cancelTime?.getTime() || 0,
          transaction: canceled.transactionId,
          state: -1,
        },
      };
    }

    return {
      result: {
        cancel_time: transaction.cancelTime?.getTime() || 0,
        transaction: transaction.transactionId,
        state: -1,
      },
    };
  }

  async getStatement(getStatementDto: GetStatementDto) {
    const { from, to } = getStatementDto.params;
    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: { gte: new Date(from), lte: new Date(to) },
        paymentMethod: "PAYME",
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      result: {
        transactions: transactions.map((t) => ({
          id: t.transactionId,
          time: t.createdAt.getTime(),
          amount: Number(t.amount) * 100,
          account: { attendanceId: t.attendanceId, contractId: t.contractId, id: 1 },
          create_time: t.createdAt.getTime(),
          perform_time: t.performTime?.getTime() || 0,
          cancel_time: t.cancelTime?.getTime() || 0,
          transaction: t.transactionId,
          state: t.state ?? null,
          reason: t.reason ?? null,
        })),
      },
    };
  }

  private getConfigValue(...keys: string[]): string | null {
    for (const key of keys) {
      if (!key) continue;
      const value = this.config.get<string>(key) ?? process.env[key];
      if (typeof value === "string" && value.trim().length) {
        return value.trim();
      }
    }
    return null;
  }

  public buildPaymePaymentUrl(amount: number | null, contractReference: string | number) {
    if (!amount || this.config.get<string>("TENANT_ID") !== "ipak_yuli") {
      return null;
    }
    const merchantId = this.getConfigValue("PAYME_MERCHANT_ID");
    if (!merchantId) return null;
    const amountInTiyin = Math.round(Number(amount) * 100);
    const params = `m=${merchantId};ac.contractId=${contractReference.toString()};ac.id=1;ac.attendanceId=null;a=${amountInTiyin};c=https://myrent.uz/contracts`;
    const latinPayload = Buffer.from(params, "utf8").toString("latin1");
    const encoded = base64.encode(latinPayload);
    return `https://checkout.paycom.uz/${encoded}`;
  }

  async getContractPaymentUrl(id: number, months?: number, startMonth?: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id }, include: { store: true } });
    if (!contract) throw new NotFoundException(`Contract with id ${id} not found`);

    const snapshot = await this.contractPayments.getSnapshotForContract({
      id: contract.id,
      issueDate: contract.issueDate,
      createdAt: contract.createdAt,
      shopMonthlyFee: contract.shopMonthlyFee,
    } as any);

    const count = months || snapshot.debtMonths || 1;
    const monthlyFee = Number(contract.shopMonthlyFee?.toString() ?? 0);
    const totalAmount = monthlyFee * count;
    const startPart = startMonth || snapshot.nextPeriodStart.toISOString().substring(0, 7);
    const intent = `INTENT:${contract.id}:${count}:${startPart}:${Date.now()}`;

    // Cancel other pending transactions for this contract
    await this.prisma.transaction.updateMany({
      where: { contractId: contract.id, status: "PENDING" },
      data: { status: "CANCELED", cancelTime: new Date() },
    });

    const pendingTx = await this.prisma.transaction.create({
      data: {
        transactionId: intent,
        amount: totalAmount as any,
        status: "PENDING",
        paymentMethod: "PAYME",
        contract: { connect: { id: contract.id } },
      },
    });

    const merchantTransId = `TX_${pendingTx.id}`;
    return this.buildPaymePaymentUrl(totalAmount, merchantTransId);
  }
}
