import { TransactionMethods } from "../types";

export class PerformTransactionDto {
  method: TransactionMethods;
  params: {
    id: string;
  };
}
