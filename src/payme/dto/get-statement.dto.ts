import { TransactionMethods } from "../types";


export class GetStatementDto {
  method: TransactionMethods;
  params: {
    from: number;
    to: number;
  };
}
