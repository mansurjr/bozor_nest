import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSaleTypeDto } from './create-sales-type.dto';
import { IsOptional, IsBoolean, IsString, IsNumber } from 'class-validator';

export class UpdateSaleTypeDto extends PartialType(CreateSaleTypeDto) {
  @ApiPropertyOptional({ description: 'Updated name of the sale type', example: 'Wholesale' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description', example: 'Wholesale sales' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated tax rate', example: 20.0 })
  @IsOptional()
  @IsNumber()
  tax?: number;
}
