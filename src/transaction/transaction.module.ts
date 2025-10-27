import { Module } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { TransactionsController } from './transaction.controller';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionModule { }
