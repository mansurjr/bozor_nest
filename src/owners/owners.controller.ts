import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards, Req, Patch, Query, ParseBoolPipe } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';

import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('Owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(
    private readonly ownersService: OwnersService,
    private readonly excelService: ExcelService
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Create a new Owner' })
  @ApiBody({ type: CreateOwnerDto })
  @ApiResponse({ status: 201, description: 'Owner successfully created.' })
  create(@Body() dto: CreateOwnerDto, @GetCurrentUser("id") id: number) {
    return this.ownersService.create(dto, id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all Owners with optional search and pagination' })
  @ApiResponse({ status: 200, description: 'List of owners returned.' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, TIN or phone' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (default 10)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  findAll(
    @Query('search') search?: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.ownersService.findAll(search, page, limit, isActive);
  }

  @Get('export/excel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export owners to Excel' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async exportExcel(
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    const { data } = await this.ownersService.findAll(search, 1, 100000, isActive);

    const flattenedData = data.map(o => ({
      'ID': o.id,
      'Full Name': o.fullName,
      'TIN': o.tin,
      'Phone': o.phoneNumber || '',
      'Address': o.address || '',
      'Status': o.isActive ? 'Active' : 'Inactive',
      'Created At': o.createdAt,
    }));

    const buffer = this.excelService.generateExcel(flattenedData, 'Owners');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="owners.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get an Owner by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Owner ID' })
  @ApiResponse({ status: 200, description: 'Owner found.' })
  @ApiResponse({ status: 404, description: 'Owner not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Update an Owner by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Owner ID' })
  @ApiBody({ type: UpdateOwnerDto })
  @ApiResponse({ status: 200, description: 'Owner updated successfully.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOwnerDto,
    @GetCurrentUser("id") userId: number,
  ) {
    return this.ownersService.update(id, dto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete (Archive) an Owner by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Owner ID' })
  @ApiResponse({ status: 200, description: 'Owner archived successfully.' })
  @ApiResponse({ status: 404, description: 'Owner not found.' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser("id") userId: number,
  ) {
    return this.ownersService.remove(id, userId);
  }
}
