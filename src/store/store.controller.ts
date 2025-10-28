import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StoresService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';

@ApiTags('Stores')
@ApiBearerAuth()
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) { }

  @Post()
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a new Store' })
  @ApiResponse({ status: 201, description: 'Store successfully created.' })
  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all Stores with optional search and pagination' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by store number or description' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of records per page', example: 10 })
  @ApiQuery({ name: 'onlyFree', required: false, description: 'Return only not-occupied stores', example: false })
  @ApiQuery({ name: 'withContracts', required: false, description: 'Include contracts relation in response', example: false })
  @ApiQuery({ name: 'asOf', required: false, description: 'ISO date to evaluate occupancy (default: today)' })
  @ApiResponse({ status: 200, description: 'List of stores returned.' })
  findAll(
    @Query('search') search?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('onlyFree') onlyFree?: string,
    @Query('withContracts') withContracts?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.storesService.findAll(search, Number(page), Number(limit), {
      onlyFree: onlyFree === 'true',
      withContracts: withContracts === 'true',
      asOf,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a Store by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store found.' })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.findOne(id);
  }

  @Patch(':id')
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Update a Store by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store updated successfully.' })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a Store by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Store not found.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.remove(id);
  }
}
