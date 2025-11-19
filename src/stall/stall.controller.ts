import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StallService } from './stall.service';
import { CreateStallDto } from './dto/create-stall.dto';
import { UpdateStallDto } from './dto/update-stall.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';

@ApiTags('Stalls')
@ApiBearerAuth()
@Controller('stalls')
export class StallController {
  constructor(private readonly stallService: StallService) { }

  @Post()
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Create a new Stall' })
  @ApiResponse({ status: 201, description: 'Stall created successfully' })
  create(@Body() dto: CreateStallDto) {
    return this.stallService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all Stalls with search and pagination' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by description or payment URLs' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Records per page', example: 10 })
  findAll(
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10
  ) {
    return this.stallService.findAll(search, Number(page), Number(limit));
  }

  @Get('check-number/:stallNumber')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check if a stall number is valid or already exists' })
  @ApiParam({
    name: 'stallNumber',
    type: String,
    description: 'The stall number to check',
    example: 'A-105',
  })
  @ApiResponse({
    status: 200,
    description: 'Stall number is available',
    schema: {
      example: { valid: true, message: 'Stall number "A-105" is available' },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Stall number is already taken',
    schema: {
      example: {
        statusCode: 400,
        message: 'Stall number "A-105" is already in use',
        error: 'Bad Request',
      },
    },
  })
  checkStallNumber(@Param('stallNumber') stallNumber: string) {
    return this.stallService.checkStallNumber(stallNumber);
  }
  
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a Stall by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stall found' })
  @ApiResponse({ status: 404, description: 'Stall not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.stallService.findOne(id);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get recent attendance history for a stall' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({ name: 'days', required: false, description: 'How many past days to include', example: 30 })
  history(@Param('id', ParseIntPipe) id: number, @Query('days') days?: string) {
    return this.stallService.getHistory(id, days ? Number(days) : 30);
  }

  @Patch(':id')
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Update a Stall by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stall updated successfully' })
  @ApiResponse({ status: 404, description: 'Stall not found' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStallDto) {
    return this.stallService.update(id, dto);
  }

  @Delete(':id')
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Delete a Stall by ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Stall deleted successfully' })
  @ApiResponse({ status: 404, description: 'Stall not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.stallService.remove(id);
  }
}
