import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { ContractPaymentPeriodsService } from './contract-payment.service';

@Module({
  controllers: [ContractController],
  providers: [ContractService, ContractPaymentPeriodsService],
  exports: [ContractPaymentPeriodsService],
})
export class ContractModule {}
