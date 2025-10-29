import { Module } from '@nestjs/common';
import { SaleTypeController } from './sales-type.controller';
import { SaleTypeService } from './sales-type.service';

@Module({
  controllers: [SaleTypeController],
  providers: [SaleTypeService],
})
export class SalesTypeModule { }
