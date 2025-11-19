import { Controller, Get, Post, Put, Delete, Param, Body, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';
import { ContractPaymentPeriodsService } from './contract-payment.service';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly contractPayments: ContractPaymentPeriodsService,
  ) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a contract' })
  @ApiResponse({ status: 201, description: 'Contract created successfully' })
  create(@Body() dto: CreateContractDto, @GetCurrentUser('id') createdById: number) {
    return this.contractService.create(dto, createdById);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all contracts' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active/inactive contracts' })
  findAll(
    @Query('page', ParseIntPipe) page = 1,
    @Query('limit', ParseIntPipe) limit = 10,
    @Query('isActive') isActive?: string,
  ) {
    const activeFilter =
      isActive !== undefined ? isActive === 'true' : undefined;

    return this.contractService.findAll(page, limit, activeFilter);
  }


  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contract by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.findOne(id);
  }

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get contract payment history' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max history items (default 30)' })
  history(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.contractService.getHistory(id, limit ? Number(limit) : undefined);
  }

  @Get(':id/refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Refresh contract with latest payment info' })
  refresh(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.refresh(id);
  }

  @Get(':id/payments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List payment periods for a contract' })
  listPayments(@Param('id', ParseIntPipe) id: number) {
    return this.contractPayments.listPayments(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update contract by ID' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractDto) {
    return this.contractService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete contract by ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.remove(id);
  }
}
