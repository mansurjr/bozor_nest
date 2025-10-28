import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { RolesGuard } from '../common/guards/guards/role.guard';
import { RolesDecorator } from '../common/decorators/roles';

@ApiTags('Attendances')
@ApiBearerAuth()
@Controller('attendances')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) { }

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
  @ApiQuery({ name: 'dateFrom', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'ISO date' })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('stallId') stallId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.attendanceService.findAll(Number(page), Number(limit), {
      stallId: stallId ? Number(stallId) : undefined,
      dateFrom,
      dateTo,
    });
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
  getPayUrl(@Param('id', ParseIntPipe) id: number) {
    return this.attendanceService.getPayUrl(id);
  }
}
