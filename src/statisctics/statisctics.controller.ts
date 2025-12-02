import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statisctics.service';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';

export type EntityType = 'stall' | 'store';

@ApiTags('Statistics')
@ApiBearerAuth()
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) { }

  @Get('daily')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get daily statistics by type (stall, store, or both)' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store'], required: false, description: 'Type of entity. Leave empty to include both' })
  @ApiResponse({
    status: 200,
    description: 'Daily statistics returned successfully',
    schema: { example: { count: 5, revenue: 250000 } },
  })
  async getDailyStatistics(@Query('type') type?: EntityType) {
    return this.statisticsService.getDailyStatistics(type);
  }

  @Get('monthly')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get monthly statistics by type (stall, store, or both)' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store'], required: false, description: 'Type of entity. Leave empty to include both' })
  @ApiResponse({
    status: 200,
    description: 'Monthly statistics returned successfully',
    schema: { example: { count: 120, revenue: 6000000 } },
  })
  async getMonthlyStatistics(@Query('type') type?: EntityType) {
    return this.statisticsService.getMonthlyStatistics(type);
  }

  @Get('current')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current month income. Optional type filter (stall or store)' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store'], required: false, description: 'Type of entity (stall or store)' })
  @ApiResponse({
    status: 200,
    description: 'Current month income returned successfully',
    schema: { example: { revenue: 8000000 } },
  })
  async getCurrentMonthIncome(@Query('type') type?: EntityType) {
    return this.statisticsService.getCurrentMonthIncome(type);
  }

  @Get('totals')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get totals with filters (date range, type, method, status)' })
  @ApiQuery({ name: 'from', required: false, description: 'From timestamp (ISO or ms)' })
  @ApiQuery({ name: 'to', required: false, description: 'To timestamp (ISO or ms)' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store', 'all'], required: false })
  @ApiQuery({ name: 'method', enum: ['PAYME', 'CLICK', 'CASH'], required: false })
  @ApiQuery({ name: 'status', required: false, description: 'Transaction/attendance status (e.g., PAID)' })
  async getTotals(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type: 'stall' | 'store' | 'all' = 'all',
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
    @Query('status') status: string = 'PAID',
  ) {
    return this.statisticsService.getTotals({ from, to, type, method, status });
  }

  @Get('series')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get time series with filters (date range, groupBy, type, method, status)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'groupBy', enum: ['daily', 'weekly', 'monthly'], required: false })
  @ApiQuery({ name: 'type', enum: ['stall', 'store', 'all'], required: false })
  @ApiQuery({ name: 'method', enum: ['PAYME', 'CLICK', 'CASH'], required: false })
  @ApiQuery({ name: 'status', required: false })
  async getSeries(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy: 'daily' | 'weekly' | 'monthly' = 'daily',
    @Query('type') type: 'stall' | 'store' | 'all' = 'all',
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
    @Query('status') status: string = 'PAID',
  ) {
    return this.statisticsService.getSeries({ from, to, groupBy, type, method, status });
  }
}
