import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';

import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('Attendances')
@ApiBearerAuth()
@Controller('attendances')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly excelService: ExcelService
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create attendance' })
  @ApiResponse({ status: 201, description: 'Attendance created successfully' })
  create(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all attendances' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'stallId', required: false })
  @ApiQuery({ name: 'date', required: false, description: 'Specific date (YYYY-MM-DD or DD.MM.YYYY)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO date' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('stallId') stallId?: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.attendanceService.findAll(Number(page), Number(limit), {
      stallId: stallId ? Number(stallId) : undefined,
      date,
      dateFrom,
      dateTo,
    });
  }

  @Get('export/excel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export attendances to Excel' })
  @ApiQuery({ name: 'stallId', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async exportExcel(
    @Res() res: Response,
    @Query('stallId') stallId?: string,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const { data } = await this.attendanceService.findAll(1, 100000, {
      stallId: stallId ? Number(stallId) : undefined,
      date,
      dateFrom,
      dateTo,
    });

    const flattenedData = data.map(a => ({
      'ID': a.id,
      'Date': a.date,
      'Stall #': a.Stall?.stallNumber || '',
      'Status': a.status,
      'Amount': Number(a.amount || 0),
      'Created At': a.createdAt,
    }));

    const buffer = this.excelService.generateExcel(flattenedData, 'Attendances');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="attendances.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get attendance history for the same stall' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back (default 30)' })
  history(@Param('id', ParseIntPipe) id: number, @Query('days') days?: string) {
    return this.attendanceService.getHistory(id, days ? Number(days) : undefined);
  }

  @Get(':id/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Force refresh of attendance payment status' })
  refresh(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.refreshStatus(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get attendance by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update attendance by ID' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAttendanceDto) {
    return this.attendanceService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete attendance by ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.remove(id);
  }

  @Get(':id/pay')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Click payment URL for attendance' })
  getPayUrl(@Param('id', ParseIntPipe) id: number, @Query('type') type: string) {
    return this.attendanceService.getPayUrl(id, type);
  }
}
