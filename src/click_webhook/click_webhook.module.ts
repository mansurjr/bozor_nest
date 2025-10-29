import { Module } from '@nestjs/common';
import { ClickWebhookService } from './click_webhook.service';
import { ClickWebhookController } from './click_webhook.controller';

@Module({
  controllers: [ClickWebhookController],
  providers: [ClickWebhookService],
})
export class ClickWebhookModule {}
