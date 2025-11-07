import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe, UseGuards, Query } from '@nestjs/common';
import { SaleTypeService } from './sales-type.service';
import { CreateSaleTypeDto } from './dto/create-sales-type.dto';
import { UpdateSaleTypeDto } from './dto/update-sales-type.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';

@ApiTags('Sale Types')
@ApiBearerAuth()
@Controller('sale-types')
export class SaleTypeController {
  constructor(private readonly saleTypeService: SaleTypeService) { }

  @Post()
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a new Sale Type' })
  @ApiBody({ type: CreateSaleTypeDto })
  @ApiResponse({ status: 201, description: 'Sale Type successfully created.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  create(@Body() dto: CreateSaleTypeDto) {
    return this.saleTypeService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all Sale Types' })
  @ApiResponse({ status: 200, description: 'List of Sale Types returned.' })
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.saleTypeService.findAll(
      search,
      page ? +page : undefined,
      limit ? +limit : undefined,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a Sale Type by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'SaleType ID' })
  @ApiResponse({ status: 200, description: 'Sale Type found.' })
  @ApiResponse({ status: 404, description: 'Sale Type not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.saleTypeService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @ApiOperation({ summary: 'Update a Sale Type by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'SaleType ID' })
  @ApiBody({ type: UpdateSaleTypeDto })
  @ApiResponse({ status: 200, description: 'Sale Type updated successfully.' })
  @ApiResponse({ status: 404, description: 'Sale Type not found.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSaleTypeDto) {
    return this.saleTypeService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', "SUPERADMIN")
  @ApiOperation({ summary: 'Delete a Sale Type by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'SaleType ID' })
  @ApiResponse({ status: 200, description: 'Sale Type deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Sale Type not found.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.saleTypeService.remove(id);
  }
}
