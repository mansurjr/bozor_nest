import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles as RoleEnum } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';
import { ExcelService } from '../common/excel/excel.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly excelService: ExcelService
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  create(@GetCurrentUser('id') id: number, @Body() dto: CreateUserDto) {
    return this.userService.create(id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN, RoleEnum.ADMIN)
  @ApiOperation({ summary: 'Get all users with optional search and role filters' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or email' })
  @ApiQuery({ name: 'role', required: false, enum: RoleEnum, description: 'Filter by role' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (default 10)' })
  @ApiResponse({ status: 200, description: 'List of users returned.' })
  findAll(
    @GetCurrentUser('id') id: number,
    @Query('search') search?: string,
    @Query('role') role?: RoleEnum,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.userService.findAll(
      id,
      search,
      role,
      page ? +page : undefined,
      limit ? +limit : undefined,
    );
  }

  @Get('export/excel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN, RoleEnum.ADMIN)
  @ApiOperation({ summary: 'Export users to Excel' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false, enum: RoleEnum })
  async exportExcel(
    @Res() res: Response,
    @GetCurrentUser('id') currentUserId: number,
    @Query('search') search?: string,
    @Query('role') role?: RoleEnum,
  ) {
    const { data } = await this.userService.findAll(currentUserId, search, role, 1, 100000);

    const flattenedData = data.map(u => ({
      'ID': u.id,
      'Email': u.email,
      'First Name': u.firstName || '',
      'Last Name': u.lastName || '',
      'Role': u.role,
      'Is Active': u.isActive ? 'Yes' : 'No',
      'Created At': u.createdAt,
    }));

    const buffer = this.excelService.generateExcel(flattenedData, 'Users');

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="users.xlsx"',
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN, RoleEnum.ADMIN)
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User found.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN, RoleEnum.ADMIN)
  @ApiOperation({ summary: 'Update a user by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'User ID' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  update(@GetCurrentUser('id') current: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(current, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @RolesDecorator(RoleEnum.SUPERADMIN)
  @ApiOperation({ summary: 'Delete a user by ID' })
  @ApiParam({ name: 'id', type: Number, description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  remove(@GetCurrentUser('id') current: number, @Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(current, id);
  }
}
