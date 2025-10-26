import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Unique store number',
    example: 'S001',
  })
  @IsString()
  storeNumber: string;

  @ApiProperty({
    description: 'Area of the store',
    example: 50.5,
  })
  @IsNumber()
  area: number;

  @ApiPropertyOptional({
    description: 'Description of the store',
    example: 'Clothing section store',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Section ID to which this store belongs',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  sectionId?: number;
}
