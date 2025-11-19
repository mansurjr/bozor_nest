import { Module } from '@nestjs/common';
import { ClickWebhookService } from './click_webhook.service';
import { ClickWebhookController } from './click_webhook.controller';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [ContractModule],
  controllers: [ClickWebhookController],
  providers: [ClickWebhookService],
})
export class ClickWebhookModule {}
