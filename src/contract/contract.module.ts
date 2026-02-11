import { Module, forwardRef } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { ContractPaymentPeriodsService } from './contract-payment.service';
import { PaymeModule } from '../payme/payme.module';
import { ClickWebhookModule } from '../click_webhook/click_webhook.module';

@Module({
  imports: [forwardRef(() => PaymeModule), forwardRef(() => ClickWebhookModule)],
  controllers: [ContractController],
  providers: [ContractService, ContractPaymentPeriodsService],
  exports: [ContractService, ContractPaymentPeriodsService],
})
export class ContractModule {}
