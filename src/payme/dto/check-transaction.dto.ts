import { TransactionMethods } from "../types";

export class CheckTransactionDto {
  method: TransactionMethods;
  params: {
    id: string;
  };
}
