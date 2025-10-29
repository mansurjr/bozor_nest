import { Module } from '@nestjs/common';
import { StatisticsService } from './statisctics.service';
import { StatisticsController } from './statisctics.controller';

@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatiscticsModule { }
