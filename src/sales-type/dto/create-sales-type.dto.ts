import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSaleTypeDto {
  @ApiProperty({ description: 'Name of the sale type', example: 'Oziq-ovqat' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description of the sale type', example: 'Faqat oziq ovqatlar uchun' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Tax rate for the sale type', example: 15.0 })
  @IsNumber()
  tax: number;
}
