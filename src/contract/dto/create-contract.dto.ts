import { IsInt, IsOptional, IsDateString, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiPropertyOptional({ description: 'Certificate number', example: 'C-001' })
  @IsOptional()
  certificateNumber?: string;

  @ApiPropertyOptional({ description: 'Issue date of contract', example: '2025-10-27' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date of contract', example: '2026-10-27' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Is the contract active?', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ description: 'Monthly shop fee', example: 500 })
  @IsOptional()
  @IsNumber()
  shopMonthlyFee?: number;

  @ApiProperty({ description: 'Owner ID', example: 1 })
  @IsInt()
  ownerId: number;

  @ApiProperty({ description: 'Store ID', example: 1 })
  @IsInt()
  storeId: number;
}
