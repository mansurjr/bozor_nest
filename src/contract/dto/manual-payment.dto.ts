import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ManualPaymentDto {
  @ApiProperty({ description: 'Unique bank transfer reference/transaction id' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  transferNumber!: string;

  @ApiPropertyOptional({ description: 'Date of transfer (ISO)', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @ApiPropertyOptional({ description: 'Total amount paid (must be exact multiple of monthly fee)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({ description: 'Number of months to apply (alternative to amount)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  months?: number;

  @ApiPropertyOptional({ description: 'Start month in YYYY-MM format', example: '2025-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'startMonth must be in YYYY-MM format' })
  startMonth?: string;

  @ApiPropertyOptional({ description: 'Internal notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
