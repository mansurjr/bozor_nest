import { TransactionMethods } from '../constants/transaction-methods';

export class CheckPerformTransactionDto {
  method: TransactionMethods;
  params: {
    amount: number;
    account: {
      attendanceId?: number;
      contractId?: string;
    };
  };
}
