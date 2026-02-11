import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards, ParseBoolPipe } from '@nestjs/common';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';
import { ContractPaymentPeriodsService } from './contract-payment.service';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { ContractPaymentType } from '@prisma/client';

import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly contractPayments: ContractPaymentPeriodsService,
    private readonly excelService: ExcelService,
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a contract' })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  create(@Body() dto: CreateContractDto, @GetCurrentUser('id') createdById: number) {
    return this.contractService.create(dto, createdById);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all contracts' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active/inactive contracts' })
  @ApiQuery({ name: 'paid', required: false, type: String, description: 'Filter by payment status for current month: paid|unpaid|true|false' })
  @ApiQuery({
    name: 'paymentType',
    required: false,
    enum: ContractPaymentType,
    description: 'Filter contracts by payment type',
  })
  @ApiQuery({ name: 'ownerId', required: false, type: Number, description: 'Filter by Owner ID' })
  @ApiQuery({ name: 'storeId', required: false, type: Number, description: 'Filter by Store ID' })
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
    @Query('paid', new ParseBoolPipe({ optional: true })) paid?: boolean,
    @Query('paymentType') paymentType?: string,
    @Query('ownerId', new ParseIntPipe({ optional: true })) ownerId?: number,
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    const paymentTypeFilter = this.parsePaymentType(paymentType);

    return this.contractService.findAll(
      page,
      limit,
      isActive,
      undefined,
      paid,
      paymentTypeFilter,
      ownerId,
      storeId,
    );
  }

  @Get('export/excel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export contracts to Excel' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'paid', required: false, type: Boolean })
  @ApiQuery({ name: 'paymentType', required: false, enum: ContractPaymentType })
  @ApiQuery({ name: 'ownerId', required: false, type: Number })
  @ApiQuery({ name: 'storeId', required: false, type: Number })
  async exportExcel(
    @Res() res: Response,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
    @Query('paid', new ParseBoolPipe({ optional: true })) paid?: boolean,
    @Query('paymentType') paymentType?: string,
    @Query('ownerId', new ParseIntPipe({ optional: true })) ownerId?: number,
    @Query('storeId', new ParseIntPipe({ optional: true })) storeId?: number,
  ) {
    const paymentTypeFilter = this.parsePaymentType(paymentType);

    const { data } = await this.contractService.findAll(
      1,
      100000,
      isActive,
      undefined,
      paid,
      paymentTypeFilter,
      ownerId,
      storeId,
      true, // skipEnrichment: true
    );

    const flattenedData = data.map(c => {
      const snap = (c as any).paymentSnapshot;
      return {
        'ID': c.id,
        'Certificate #': c.certificateNumber || '',
        'Owner': c.owner?.fullName || '',
        'Owner TIN': c.owner?.tin || '',
        'Store #': c.store?.storeNumber || '',
        'Monthly Fee': Number(c.shopMonthlyFee),
        'Payment Type': c.paymentType,
        'Is Active': c.isActive ? 'Yes' : 'No',
        'Issue Date': c.issueDate,
        'Expiry Date': c.expiryDate,
        'Debt Months': snap?.debtMonths || 0,
        'Debt Amount': snap?.debtAmount || 0,
        'Paid Through': snap?.paidThrough || '',
      };
    });

    const buffer = this.excelService.generateExcel(flattenedData, 'Contracts');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="contracts.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }


  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contract by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.findOne(id);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contract payment history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max history items (default 30)' })
  history(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.contractService.getHistory(id, limit ? Number(limit) : undefined);
  }

  @Get(':id/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Refresh contract with latest payment info' })
  refresh(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.refresh(id);
  }

  @Get(':id/payment-urls')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get payment link for a contract' })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of months to pay for' })
  @ApiQuery({ name: 'startMonth', required: false, type: String, description: 'The month to start paying from (YYYY-MM)' })
  @ApiQuery({ name: 'method', required: false, enum: ['CLICK', 'PAYME'], description: 'Payment method to use' })
  async getPaymentUrls(
    @Param('id', ParseIntPipe) id: number,
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
    @Query('startMonth') startMonth?: string,
    @Query('method') method?: string,
  ) {
    const paymentMethod = (method?.toUpperCase() === 'PAYME' ? 'PAYME' : 'CLICK') as 'CLICK' | 'PAYME';
    const url = await this.contractService.getPaymentUrls(id, months, startMonth, paymentMethod);
    return { url };
  }

  @Get(':id/payments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List payment periods for a contract' })
  listPayments(@Param('id', ParseIntPipe) id: number) {
    return this.contractPayments.listPayments(id);
  }

  @Post(':id/payments/manual')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Register a manual bank transfer payment' })
  @ApiResponse({ status: 201, description: 'Manual payment recorded and periods updated' })
  manualPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManualPaymentDto,
    @GetCurrentUser('id') createdById: number,
  ) {
    return this.contractPayments.recordManualPayment(id, dto, createdById);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update contract by ID' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractDto,
    @GetCurrentUser('id') userId: number,
  ) {
    return this.contractService.update(id, dto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete (Archive) contract by ID' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser('id') userId: number,
  ) {
    return this.contractService.remove(id, userId);
  }

  private parsePaymentType(input?: string): ContractPaymentType | undefined {
    if (!input) return undefined;
    const normalized = input.trim().toUpperCase();
    return normalized === ContractPaymentType.BANK_ONLY
      ? ContractPaymentType.BANK_ONLY
      : normalized === ContractPaymentType.ONLINE
        ? ContractPaymentType.ONLINE
        : undefined;
  }
}
