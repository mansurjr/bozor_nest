import { CancelTransactionDto } from './cancel-transaction.dto';
import { CheckPerformTransactionDto } from './check-perform-transaction.dto';
import { CheckTransactionDto } from './check-transaction.dto';
import { CreateTransactionDto } from './create-transaction.dto';
import { GetStatementDto } from './get-statement.dto';
import { PerformTransactionDto } from './perform-transaction.dto';

export type RequestBody =
  | CheckPerformTransactionDto
  | CreateTransactionDto
  | PerformTransactionDto
  | CancelTransactionDto
  | CheckTransactionDto
  | GetStatementDto;
