import { Module } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { TransactionsController } from './transaction.controller';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [ContractModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionModule { }
