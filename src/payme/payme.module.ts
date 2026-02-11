import { Module, forwardRef } from '@nestjs/common';
import { PaymeService } from './payme.service';
import { PaymeController } from './payme.controller';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [forwardRef(() => ContractModule)],
  controllers: [PaymeController],
  providers: [PaymeService],
  exports: [PaymeService],
})
export class PaymeModule {}
