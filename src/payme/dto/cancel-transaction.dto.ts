import { TransactionMethods } from "../types";

export class CancelTransactionDto {
  method: TransactionMethods;
  params: {
    id: string;
    reason: number;
  };
}
