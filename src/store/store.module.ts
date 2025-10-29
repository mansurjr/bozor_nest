import { Module } from '@nestjs/common';
import { StoresService } from './store.service';
import { StoresController } from './store.controller';

@Module({
  controllers: [StoresController],
  providers: [StoresService],
})
export class StoreModule { }