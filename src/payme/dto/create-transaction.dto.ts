import { TransactionMethods } from "../types";

export class CreateTransactionDto {
  method: TransactionMethods;
  params: {
    id: string;
    time: number;
    amount: number;
    account: {
      attendanceId: number,
      contractId: string,
      id: number
    };
  };
}
