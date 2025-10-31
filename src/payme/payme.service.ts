import { Injectable } from '@nestjs/common';
import { TransactionMethods } from './constants/transaction-methods';
import { CheckPerformTransactionDto } from './dto/check-perform-transaction.dto';
import { GetStatementDto } from './dto/get-statement.dto';
import { CancelTransactionDto } from './dto/cancel-transaction.dto';
import { PerformTransactionDto } from './dto/perform-transaction.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ErrorStatusCodes } from './constants/error-status-codes';
import { TransactionState } from './constants/transaction-state';
import { CheckTransactionDto } from './dto/check-transaction.dto';
import { PaymeError } from './constants/payme-error';
import { DateTime } from 'luxon';
import { CancelingReasons } from './constants/canceling-reasons';
import { RequestBody } from './dto/incominBody';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Store, Transaction } from '@prisma/client';

@Injectable()
export class PaymeService {
  constructor(private readonly prisma: PrismaService) { }

  // async handleTransactionMethods(reqBody: RequestBody) {
  //   const method = reqBody.method;
  //   switch (method) {
  //     case TransactionMethods.CheckPerformTransaction:
  //       return await this.checkPerformTransaction(
  //         reqBody as CheckPerformTransactionDto,
  //       );

  //     case TransactionMethods.CreateTransaction:
  //       return await this.createTransaction(reqBody as CreateTransactionDto);

  //     case TransactionMethods.CheckTransaction:
  //       return await this.checkTransaction(
  //         reqBody as unknown as CheckTransactionDto,
  //       );

  //     case TransactionMethods.PerformTransaction:
  //       return await this.performTransaction(reqBody as PerformTransactionDto);

  //     case TransactionMethods.CancelTransaction:
  //       return await this.cancelTransaction(reqBody as CancelTransactionDto);

  //     case TransactionMethods.GetStatement:
  //       return await this.getStatement(reqBody as GetStatementDto);
  //     default:
  //       return 'Invalid transaction method';
  //   }
  // }

  // /**
  //  * If payment is possible, the CheckPerformTransaction method returns the result allow.
  //  * If payment is impossible, the method returns an error.
  //  *
  //  * @param {CheckPerformTransactionDto} checkPerformTransactionDto
  //  */
  // async checkPerformTransaction(
  //   checkPerformTransactionDto: CheckPerformTransactionDto,
  // ) {
  //   let transaction: Transaction;
  //   let isDaily = false;

  //   const account = checkPerformTransactionDto.params.account;
  //   const transId = account.attenadanceId
  //   const amount = new Prisma.Decimal(checkPerformTransactionDto.params.amount);

  //   if (!transId) {
  //     return {
  //       error: {
  //         code: ErrorStatusCodes.TransactionNotAllowed,
  //         message: {
  //           uz: 'Hisob ma’lumotlari topilmadi',
  //           en: 'Account information not found',
  //           ru: 'Информация об аккаунте не найдена',
  //         },
  //         data: null,
  //       },
  //     };
  //   }

  //   const attendanceId = Number(transId);
  //   const attendance = await this.prisma.attendance.findUnique({
  //     where: { id: attendanceId },
  //   });

  //   if (attendance) {
  //     isDaily = true;

  //     const todayStart = new Date();
  //     todayStart.setHours(0, 0, 0, 0);
  //     const todayEnd = new Date();
  //     todayEnd.setHours(23, 59, 59, 999);

  //     const existingDaily = await this.prisma.transaction.findFirst({
  //       where: {
  //         attendanceId: attendance.id,
  //         status: 'PAID',
  //         createdAt: { gte: todayStart, lte: todayEnd },
  //       },
  //     });

  //     if (existingDaily) {
  //       return {
  //         error: {
  //           code: ErrorStatusCodes.TransactionNotAllowed,
  //           message: {
  //             uz: 'Bugungi kun uchun allaqachon to‘lov amalga oshirilgan',
  //             en: 'Payment has already been made for today',
  //             ru: 'Оплата за сегодняшний день уже была произведена',
  //           },
  //           data: null,
  //         },
  //       };
  //     }

  //     transaction = await this.prisma.transaction.create({
  //       data: {
  //         transactionId: String(attendance.id),
  //         amount: attendance.amount ?? new Prisma.Decimal(0),
  //         status: 'PENDING',
  //         paymentMethod: 'PAYME',
  //         attendance: { connect: { id: attendance.id } },
  //       },
  //     });
  //   } else {
  //     const existing = await this.prisma.transaction.findFirst({
  //       where: { transactionId: transId.toString() },
  //     });

  //     if (existing && existing.status === 'PAID') {
  //       return {
  //         error: {
  //           code: ErrorStatusCodes.TransactionNotAllowed,
  //           message: {
  //             uz: 'Ushbu oy uchun allaqachon to‘lov amalga oshirilgan',
  //             en: 'Payment has already been made for this month',
  //             ru: 'Оплата за этот месяц уже была произведена',
  //           },
  //           data: null,
  //         },
  //       };
  //     }

  //     if (!existing) {
  //       transaction = await this.prisma.transaction.create({
  //         data: {
  //           transactionId: transId.toString(),
  //           amount,
  //           status: 'PENDING',
  //           paymentMethod: 'PAYME',
  //         },
  //       });
  //     } else {
  //       transaction = existing;
  //     }
  //   }

  //   if (!transaction.amount.equals(amount)) {
  //     return {
  //       error: {
  //         code: ErrorStatusCodes.InvalidAmount,
  //         message: {
  //           uz: 'To‘lov summasi noto‘g‘ri',
  //           en: 'Invalid payment amount',
  //           ru: 'Неверная сумма платежа',
  //         },
  //         data: null,
  //       },
  //     };
  //   }

  //   // ✅ All checks passed
  //   return {
  //     result: {
  //       allow: true,
  //       isDaily,
  //       transactionId: transaction.id,
  //     },
  //   };
  // }

  // /**
  //  * The CreateTransaction method returns a list of payment recipients.
  //  * When the payment originator is the recipient, the field receivers can be omitted or set to NULL.
  //  * If a transaction has already been created,
  //  * the merchant application performs basic verification of the transaction
  //  * and returns the verification result to Payme Business.
  //  *
  //  * @param {CreateTransactionDto} createTransactionDto
  //  */
  // async createTransaction(createTransactionDto: CreateTransactionDto) {
  //   const planId = createTransactionDto.params?.account?.planId;
  //   const userId = createTransactionDto.params?.account?.user_id;
  //   const transId = createTransactionDto.params?.id;

  //   const plan = await this.prismaService.plans.findUnique({
  //     where: {
  //       id: planId,
  //     },
  //   });

  //   const user = await this.prismaService.users.findUnique({
  //     where: {
  //       id: userId,
  //     },
  //   });

  //   if (!user) {
  //     return {
  //       error: PaymeError.UserNotFound,
  //       id: transId,
  //     };
  //   }

  //   if (!plan) {
  //     return {
  //       error: PaymeError.ProductNotFound,
  //       id: transId,
  //     };
  //   }

  //   const transaction = await this.prismaService.transactions.findUnique({
  //     where: {
  //       transId,
  //     },
  //   });

  //   if (transaction) {
  //     if (transaction.status !== 'PENDING') {
  //       return {
  //         error: PaymeError.CantDoOperation,
  //         id: transId,
  //       };
  //     }

  //     if (this.checkTransactionExpiration(transaction.createdAt)) {
  //       await this.prismaService.transactions.update({
  //         where: {
  //           transId,
  //         },
  //         data: {
  //           status: 'CANCELED',
  //           cancelTime: new Date(),
  //           state: TransactionState.PendingCanceled,
  //           reason: CancelingReasons.CanceledDueToTimeout,
  //         },
  //       });

  //       return {
  //         error: {
  //           ...PaymeError.CantDoOperation,
  //           state: TransactionState.PendingCanceled,
  //           reason: CancelingReasons.CanceledDueToTimeout,
  //         },
  //         id: transId,
  //       };
  //     }

  //     return {
  //       result: {
  //         transaction: transaction.id,
  //         state: TransactionState.Pending,
  //         create_time: new Date(transaction.createdAt).getTime(),
  //       },
  //     };
  //   }

  //   const checkTransaction: CheckPerformTransactionDto = {
  //     method: TransactionMethods.CheckPerformTransaction,
  //     params: {
  //       amount: plan.price,
  //       account: {
  //         planId,
  //         user_id: userId,
  //       },
  //     },
  //   };

  //   const checkResult = await this.checkPerformTransaction(checkTransaction);

  //   if (checkResult.error) {
  //     return {
  //       error: checkResult.error,
  //       id: transId,
  //     };
  //   }

  //   const newTransaction = await this.prismaService.transactions.create({
  //     data: {
  //       transId: createTransactionDto.params.id,
  //       user: {
  //         connect: {
  //           id: createTransactionDto.params.account.user_id,
  //         },
  //       },
  //       plan: {
  //         connect: {
  //           id: createTransactionDto.params.account.planId,
  //         },
  //       },
  //       provider: 'payme',
  //       state: TransactionState.Pending,
  //       amount: createTransactionDto.params.amount,
  //     },
  //   });

  //   return {
  //     result: {
  //       transaction: newTransaction.id,
  //       state: TransactionState.Pending,
  //       create_time: new Date(newTransaction.createdAt).getTime(),
  //     },
  //   };
  // }

  // /**
  //  * The PerformTransaction method credits
  //  * funds to the merchant’s account and sets the order to “paid” status.
  //  *
  //  * @param {PerformTransactionDto} performTransactionDto
  //  */
  // async performTransaction(performTransactionDto: PerformTransactionDto) {
  //   const transaction = await this.prismaService.transactions.findUnique({
  //     where: {
  //       transId: performTransactionDto.params.id,
  //     },
  //   });

  //   if (!transaction) {
  //     return {
  //       error: PaymeError.TransactionNotFound,
  //       id: performTransactionDto.params.id,
  //     };
  //   }

  //   if (transaction.status !== 'PENDING') {
  //     if (transaction.status !== 'PAID') {
  //       return {
  //         error: PaymeError.CantDoOperation,
  //         id: performTransactionDto.params.id,
  //       };
  //     }

  //     return {
  //       result: {
  //         state: transaction.state,
  //         transaction: transaction.id,
  //         perform_time: new Date(transaction.performTime).getTime(),
  //       },
  //     };
  //   }

  //   const expirationTime = this.checkTransactionExpiration(
  //     transaction.createdAt,
  //   );

  //   if (expirationTime) {
  //     await this.prismaService.transactions.update({
  //       where: {
  //         transId: performTransactionDto.params.id,
  //       },
  //       data: {
  //         status: 'CANCELED',
  //         cancelTime: new Date(),
  //         state: TransactionState.PendingCanceled,
  //         reason: CancelingReasons.CanceledDueToTimeout,
  //       },
  //     });
  //     return {
  //       error: {
  //         state: TransactionState.PendingCanceled,
  //         reason: CancelingReasons.CanceledDueToTimeout,
  //         ...PaymeError.CantDoOperation,
  //       },
  //       id: performTransactionDto.params.id,
  //     };
  //   }

  //   // TODO: Implement perform transaction for your service here

  //   const performTime = new Date();

  //   const updatedPayment = await this.prismaService.transactions.update({
  //     where: {
  //       transId: performTransactionDto.params.id,
  //     },
  //     data: {
  //       status: 'PAID',
  //       state: TransactionState.Paid,
  //       performTime,
  //     },
  //   });

  //   return {
  //     result: {
  //       transaction: updatedPayment.id,
  //       perform_time: performTime.getTime(),
  //       state: TransactionState.Paid,
  //     },
  //   };
  // }

  // /**
  //  * The CancelTransaction method cancels both a created and a completed transaction.
  //  *
  //  * @param {CancelTransactionDto} cancelTransactionDto
  //  */
  // async cancelTransaction(cancelTransactionDto: CancelTransactionDto) {
  //   const transId = cancelTransactionDto.params.id;

  //   const transaction = await this.prismaService.transactions.findUnique({
  //     where: {
  //       transId,
  //     },
  //   });

  //   if (!transaction) {
  //     return {
  //       id: transId,
  //       error: PaymeError.TransactionNotFound,
  //     };
  //   }

  //   if (transaction.status === 'PENDING') {
  //     const cancelTransaction = await this.prismaService.transactions.update({
  //       where: {
  //         id: transaction.id,
  //       },
  //       data: {
  //         status: 'CANCELED',
  //         state: TransactionState.PendingCanceled,
  //         cancelTime: new Date(),
  //         reason: cancelTransactionDto.params.reason,
  //       },
  //     });

  //     return {
  //       result: {
  //         cancel_time: cancelTransaction.cancelTime.getTime(),
  //         transaction: cancelTransaction.id,
  //         state: TransactionState.PendingCanceled,
  //       },
  //     };
  //   }

  //   if (transaction.state !== TransactionState.Paid) {
  //     return {
  //       result: {
  //         state: transaction.state,
  //         transaction: transaction.id,
  //         cancel_time: transaction.cancelTime.getTime(),
  //       },
  //     };
  //   }

  //   // TODO: Implement cancel transaction for your service here, e.g set transaction state to CANCELED

  //   const updatedTransaction = await this.prismaService.transactions.update({
  //     where: {
  //       id: transaction.id,
  //     },
  //     data: {
  //       status: 'CANCELED',
  //       state: TransactionState.PaidCanceled,
  //       cancelTime: new Date(),
  //       reason: cancelTransactionDto.params.reason,
  //     },
  //   });

  //   return {
  //     result: {
  //       cancel_time: updatedTransaction.cancelTime.getTime(),
  //       transaction: updatedTransaction.id,
  //       state: TransactionState.PaidCanceled,
  //     },
  //   };
  // }

  // /**
  //  * @param {CheckTransactionDto} checkTransactionDto
  //  */
  // async checkTransaction(checkTransactionDto: CheckTransactionDto) {
  //   const transaction = await this.prismaService.transactions.findUnique({
  //     where: {
  //       transId: checkTransactionDto.params.id,
  //     },
  //   });

  //   if (!transaction) {
  //     return {
  //       error: PaymeError.TransactionNotFound,
  //       id: checkTransactionDto.params.id,
  //     };
  //   }

  //   return {
  //     result: {
  //       create_time: transaction.createdAt.getTime(),
  //       perform_time: new Date(transaction.performTime).getTime(),
  //       cancel_time: new Date(transaction.cancelTime).getTime(),
  //       transaction: transaction.id,
  //       state: transaction.state,
  //       reason: transaction.reason,
  //     },
  //   };
  // }

  // /**
  //  * To return a list of transactions for a specified period,
  //  * the GetStatement method is used
  //  * @param {GetStatementDto} getStatementDto
  //  */
  // async getStatement(getStatementDto: GetStatementDto) {
  //   const transactions = await this.prismaService.transactions.findMany({
  //     where: {
  //       createdAt: {
  //         gte: new Date(getStatementDto.params.from),
  //         lte: new Date(getStatementDto.params.to),
  //       },
  //       provider: 'payme', // ! Transaction only from Payme
  //     },
  //   });

  //   return {
  //     result: {
  //       transactions: transactions.map((transaction) => {
  //         return {
  //           id: transaction.transId,
  //           time: new Date(transaction.createdAt).getTime(),
  //           amount: transaction.amount,
  //           account: {
  //             user_id: transaction.userId,
  //             planId: transaction.planId,
  //           },
  //           create_time: new Date(transaction.createdAt).getTime(),
  //           perform_time: new Date(transaction.performTime).getTime(),
  //           cancel_time: new Date(transaction.cancelTime).getTime(),
  //           transaction: transaction.id,
  //           state: transaction.state,
  //           reason: transaction.reason || null,
  //         };
  //       }),
  //     },
  //   };
  // }

  // private checkTransactionExpiration(createdAt: Date) {
  //   const transactionCreatedAt = new Date(createdAt);
  //   const timeoutDuration = 720;
  //   const timeoutThreshold = DateTime.now()
  //     .minus({
  //       minutes: timeoutDuration,
  //     })
  //     .toJSDate();

  //   return transactionCreatedAt < timeoutThreshold;
  // }
}
