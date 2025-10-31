import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { GetContractsDto } from './dto/contracts.dto';
import { GetStallDto } from './dto/getPayInfo.dto';

@ApiTags('Public Payments')
@Controller('public/pay')
export class PublicController {
  constructor(private readonly publicService: PublicService) { }

  @Get('contracts')
  @ApiOperation({
    summary: 'Get contracts by storeNumber or TIN',
    description:
      'Search active contracts by store number or TIN. Returns contract details and whether it is paid for the current month.',
  })
  @ApiQuery({ name: 'storeNumber', required: false, description: 'Store number' })
  @ApiQuery({ name: 'tin', required: false, description: 'Tax Identification Number' })
  @ApiResponse({
    status: 200,
    description: 'List of matching contracts with payment status for this month',
  })
  @ApiResponse({ status: 400, description: 'Invalid query or no results found' })
  async getContracts(@Query() query: GetContractsDto) {
    return this.publicService.contract(query);
  }

  @Get('stalls/:id')
  @ApiOperation({
    summary: 'Search stall payment info',
    description:
      'Search stalls by stall number (partial match allowed). Optionally filter by date (YYYY-MM-DD). Returns each stall’s details and whether attendance is paid for that day.',
  })
  @ApiParam({
    name: 'id',
    description: 'Stall number or partial match (e.g. "A1" matches "A10", "A12")',
    example: 'A1',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Optional date in YYYY-MM-DD format (defaults to today)',
    example: '2025-10-25',
  })
  @ApiResponse({
    status: 200,
    description: 'List of stalls with payment status for the selected date',
  })
  @ApiResponse({ status: 404, description: 'No stalls found' })
  async getStall(@Param('id') id: string, @Query('date') date?: string) {
    return this.publicService.getStallStatus({ id, date });
  }
}
