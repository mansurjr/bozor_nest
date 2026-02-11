import { Module, forwardRef } from '@nestjs/common';
import { ClickWebhookService } from './click_webhook.service';
import { ClickWebhookController } from './click_webhook.controller';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [forwardRef(() => ContractModule)],
  controllers: [ClickWebhookController],
  providers: [ClickWebhookService],
  exports: [ClickWebhookService],
})
export class ClickWebhookModule {}
