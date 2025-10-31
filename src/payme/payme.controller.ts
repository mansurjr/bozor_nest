import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { PaymeService } from './payme.service';
import type { RequestBody } from './dto/incominBody';
import { PaymeBasicAuthGuard } from '../common/guards/guards/paymeGuard.guard';

@Controller('payme')
export class PaymeController {
  constructor(private readonly paymeService: PaymeService) {
  }
  @Post()
  @UseGuards(PaymeBasicAuthGuard)
  @HttpCode(HttpStatus.OK)
  async handleTransactionMethods(@Body() reqBody: RequestBody) {
    return await this.paymeService.handleTransactionMethods(reqBody);
  }
}
