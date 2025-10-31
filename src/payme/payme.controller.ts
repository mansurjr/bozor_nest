import { Controller } from '@nestjs/common';
import { PaymeService } from './payme.service';

@Controller('payme')
export class PaymeController {
  constructor(private readonly paymeService: PaymeService) {}
}
