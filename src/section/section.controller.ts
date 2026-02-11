import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe, UseGuards, Patch, Query, Res } from '@nestjs/common';
import { SectionService } from './section.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesDecorator } from '../common/decorators/roles';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';

import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';

@ApiTags('Sections')
@ApiBearerAuth()
@Controller('sections')
export class SectionController {
  constructor(
    private readonly sectionService: SectionService,
    private readonly excelService: ExcelService
  ) { }

  @Post()
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a new Section' })
  @ApiBody({ type: CreateSectionDto })
  @ApiResponse({ status: 201, description: 'Section successfully created.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  create(@Body() dto: CreateSectionDto) {
    return this.sectionService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all Sections' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or description' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of Sections returned.' })
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.sectionService.findAll(
      search,
      page ? +page : undefined,
      limit ? +limit : undefined,
    );
  }

  @Get('export/excel')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export sections to Excel' })
  async exportExcel(@Res() res: Response) {
    const { data } = await this.sectionService.findAll(undefined, 1, 100000);

    const flattenedData = data.map(s => ({
      'ID': s.id,
      'Name': s.name,
      'Description': s.description || '',
      'Assigned Checker': s.assignedChecker?.firstName || '',
    }));

    const buffer = this.excelService.generateExcel(flattenedData, 'Sections');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sections.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a Section by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section found.' })
  @ApiResponse({ status: 404, description: 'Section not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sectionService.findOne(id);
  }

  @Patch(':id')
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Update a Section by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Section ID' })
  @ApiBody({ type: UpdateSectionDto })
  @ApiResponse({ status: 200, description: 'Section updated successfully.' })
  @ApiResponse({ status: 404, description: 'Section not found.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSectionDto) {
    return this.sectionService.update(id, dto);
  }

  @Delete(':id')
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a Section by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Section ID' })
  @ApiResponse({ status: 200, description: 'Section deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Section not found.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sectionService.remove(id);
  }
}
