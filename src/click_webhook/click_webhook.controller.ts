import { Controller, Post, Body } from '@nestjs/common';
import { ClickWebhookService } from './click_webhook.service';
import { ClickDataDto } from './dto/clickHandlePrepare-dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Click Webhook')
@Controller('click')
export class ClickWebhookController {
  constructor(private readonly clickService: ClickWebhookService) {}

  @Post('prepare')
  @ApiOperation({ summary: 'Prepare Click transaction' })
  @ApiResponse({ status: 200 })
  async prepare(@Body() clickData: ClickDataDto) {
    return this.clickService.handlePrepare(clickData);
  }

  @Post('complete')
  @ApiOperation({ summary: 'Complete Click transaction' })
  @ApiResponse({ status: 200 })
  async complete(@Body() clickData: ClickDataDto) {
    return this.clickService.handleComplete(clickData);
  }
}
