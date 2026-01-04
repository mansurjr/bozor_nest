// src/pay/dto/get-stall.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, Min, IsOptional, IsDateString, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetStallDto {
  @ApiProperty({ description: 'Stall ID', example: 1 })
  @IsString()
  id: string;

  @ApiPropertyOptional({
    description: 'Date to filter stall data (YYYY-MM-DD)',
    example: '2025-10-25',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Date must be in YYYY-MM-DD format' })
  date?: string;

  @ApiPropertyOptional({
    description: 'Response shape hint (use "min" for minimal list items)',
    example: 'min',
  })
  @IsOptional()
  @IsString()
  @IsIn(['min'])
  fields?: 'min';
}
