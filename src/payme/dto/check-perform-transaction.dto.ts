import { TransactionMethods } from "../types";

export class CheckPerformTransactionDto {
  method: TransactionMethods.CheckPerformTransaction;
  params: {
    amount: number;
    account: {
      attendanceId: number,
      contractId: string,
      id: number
    };
  };
}