import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards, Req, Patch, Query } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';

@ApiTags('Owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) { }

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
  findAll(
    @Query('search') search?: string,
    @Query('page', ParseIntPipe) page?: number,
    @Query('limit', ParseIntPipe) limit?: number,
  ) {
    return this.ownersService.findAll(search, page ? page : undefined, limit ? +limit : undefined);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOwnerDto) {
    return this.ownersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Delete an Owner by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'Owner ID' })
  @ApiResponse({ status: 200, description: 'Owner deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Owner not found.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.remove(id);
  }
}
