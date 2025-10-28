import { IsOptional, IsString, IsNumber, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStallDto {
  @ApiProperty({ description: 'Stall area', example: 50.5 })
  @IsNumber()
  @IsPositive()
  area: number;


  @ApiProperty({ description: 'Stall number', example: 'A1' })
  @IsString()
  stallNumber: string;

  @ApiPropertyOptional({ description: 'SaleType ID', example: 1 })
  @IsNumber()
  saleTypeId: number;

  @ApiPropertyOptional({ description: 'Section ID', example: 1 })
  @IsNumber()
  sectionId: number;

  @ApiPropertyOptional({ description: 'Description', example: 'Corner stall' })
  @IsOptional()
  @IsString()
  description?: string;

}
