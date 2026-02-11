// transactions.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly excelService: ExcelService
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiBody({ type: CreateTransactionDto })
  @ApiResponse({ status: 201, description: 'Transaction created successfully.' })
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all transactions with optional search and pagination' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by transactionId or status' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'paymentMethod', required: false, description: 'Filter by payment method' })
  @ApiQuery({ name: 'source', required: false, description: 'Filter by source (contract|attendance)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'contractId', required: false, type: Number, description: 'Filter by contract ID' })
  @ApiQuery({ name: 'attendanceId', required: false, type: Number, description: 'Filter by attendance ID' })
  @ApiResponse({ status: 200, description: 'Transactions returned.' })
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('source') source?: 'contract' | 'attendance',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('contractId') contractId?: number,
    @Query('attendanceId') attendanceId?: number,
  ) {
    return this.transactionsService.findAll({
      search,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
      paymentMethod,
      source,
      dateFrom,
      dateTo,
      contractId: contractId ? +contractId : undefined,
      attendanceId: attendanceId ? +attendanceId : undefined,
    });
  }

  @Get('export/excel')
  @ApiOperation({ summary: 'Export transactions to Excel' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentMethod', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'attendanceId', required: false })
  async exportExcel(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('source') source?: 'contract' | 'attendance',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('contractId') contractId?: number,
    @Query('attendanceId') attendanceId?: number,
  ) {
    const { data } = await this.transactionsService.findAll({
      search,
      status,
      paymentMethod,
      source,
      dateFrom,
      dateTo,
      contractId: contractId ? +contractId : undefined,
      attendanceId: attendanceId ? +attendanceId : undefined,
      limit: 100000, // Large limit for export
      page: 1,
    });

    const flattenedData = data.map(t => ({
      'ID': t.id,
      'Transaction ID': t.transactionId,
      'Amount': Number(t.amount),
      'Status': t.status,
      'Payment Method': t.paymentMethod,
      'Source': t.contractId ? 'Contract' : (t.attendanceId ? 'Attendance' : 'Other'),
      'Date': t.createdAt,
      'Payer/Owner': t.contract?.owner?.fullName || '',
      'Store/Stall': t.contract?.store?.storeNumber || t.attendance?.Stall?.stallNumber || '',
    }));

    const buffer = this.excelService.generateExcel(flattenedData, 'Transactions');
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="transactions.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a transaction by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Transaction found.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a transaction by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateTransactionDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTransactionDto) {
    return this.transactionsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a transaction by ID' })
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.remove(id);
  }
}
