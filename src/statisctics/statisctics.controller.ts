import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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

  @Get('monthly/:year/:month')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get statistics for a specific month (1-12)' })
  @ApiParam({ name: 'year', required: true, type: Number })
  @ApiParam({ name: 'month', required: true, type: Number, description: '1-12' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store'], required: false, description: 'Type of entity. Leave empty to include both' })
  async getMonthStatistics(
    @Param('year') year: string,
    @Param('month') month: string,
    @Query('type') type?: EntityType,
  ) {
    return this.statisticsService.getMonthlyStatisticsFor(Number(month), Number(year), type);
  }

  @Get('monthly/:year/:month/details')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get detailed breakdown (stall/store/methods) for a specific month' })
  @ApiParam({ name: 'year', required: true, type: Number })
  @ApiParam({ name: 'month', required: true, type: Number, description: '1-12' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store'], required: false, description: 'Type of entity. Leave empty to include both' })
  async getMonthDetails(
    @Param('year') year: string,
    @Param('month') month: string,
    @Query('type') type?: EntityType,
  ) {
    return this.statisticsService.getMonthlyDetails(Number(month), Number(year), type);
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

  @Get('series/monthly')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Convenience monthly series for last N months (default 12)' })
  @ApiQuery({ name: 'months', required: false, description: 'How many recent months to include (max 36)' })
  @ApiQuery({ name: 'type', enum: ['stall', 'store', 'all'], required: false })
  @ApiQuery({ name: 'method', enum: ['PAYME', 'CLICK', 'CASH'], required: false })
  async getMonthlySeries(
    @Query('months') months?: string,
    @Query('type') type: 'stall' | 'store' | 'all' = 'all',
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
  ) {
    return this.statisticsService.getRecentMonthlySeries({ months: Number(months), type, method });
  }

  // Reconciliation endpoints
  @Get('reconciliation/ledger')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Kunlik daftar: rasta va do‘kon to‘lovlari (PAID/PENDING/FAILED) Tashkent TZ' })
  async getReconciliationLedger(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('type') type: 'stall' | 'store' | 'all' = 'all',
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
    @Query('status') status?: string,
    @Query('sectionId') sectionId?: string,
    @Query('contractId') contractId?: string,
    @Query('stallId') stallId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.statisticsService.getReconciliationLedger({
      from,
      to,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      type,
      method,
      status,
      sectionId: sectionId ? Number(sectionId) : undefined,
      contractId: contractId ? Number(contractId) : undefined,
      stallId: stallId ? Number(stallId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('reconciliation/contracts')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Shartnoma bo‘yicha yig‘indi: oylik ijara vs to‘langan, ortiqcha yoki kam' })
  async getReconciliationContractSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
    @Query('status') status?: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.statisticsService.getReconciliationContractSummary({
      from,
      to,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      method,
      status,
      sectionId: sectionId ? Number(sectionId) : undefined,
    });
  }

  @Get('reconciliation/monthly')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Oylik trend (so‘nggi oylar) rasta/do‘kon kesimida' })
  async getReconciliationMonthlyRollup(
    @Query('months') months?: string,
    @Query('type') type: 'stall' | 'store' | 'all' = 'all',
    @Query('method') method?: 'PAYME' | 'CLICK' | 'CASH',
    @Query('status') status?: string,
  ) {
    return this.statisticsService.getReconciliationMonthlyRollup({
      months: months ? Number(months) : undefined,
      type,
      method,
      status,
    });
  }

  // Monthly paid/unpaid for contracts using ContractPaymentPeriod
  @Get('reconciliation/contracts/monthly-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Contracts monthly paid/unpaid status for selected month' })
  @ApiQuery({ name: 'year', required: true, description: 'Year, e.g., 2024' })
  @ApiQuery({ name: 'month', required: true, description: 'Month 1-12' })
  @ApiQuery({ name: 'sectionId', required: false, description: 'Filter by section id' })
  async getContractsMonthlyStatus(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('sectionId') sectionId?: string,
  ) {
    return this.statisticsService.getContractsMonthlyStatus({
      year: Number(year),
      month: Number(month),
      sectionId: sectionId ? Number(sectionId) : undefined,
    });
  }

  // Monthly paid/unpaid for stalls using Attendance within month
  @Get('reconciliation/stalls/monthly-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Stalls monthly paid/unpaid summary for selected month' })
  @ApiQuery({ name: 'year', required: true, description: 'Year, e.g., 2024' })
  @ApiQuery({ name: 'month', required: true, description: 'Month 1-12' })
  @ApiQuery({ name: 'sectionId', required: false, description: 'Filter by section id' })
  @ApiQuery({ name: 'stallId', required: false, description: 'Filter by stall id' })
  async getStallsMonthlyStatus(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('sectionId') sectionId?: string,
    @Query('stallId') stallId?: string,
  ) {
    return this.statisticsService.getStallsMonthlyStatus({
      year: Number(year),
      month: Number(month),
      sectionId: sectionId ? Number(sectionId) : undefined,
      stallId: stallId ? Number(stallId) : undefined,
    });
  }
}
