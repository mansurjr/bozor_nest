import { IsString, IsOptional, IsNotEmpty, IsNumber, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSectionDto {
  @ApiProperty({
    description: 'Name of the section',
    example: 'Electronics',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the section',
    example: 'Section for electronic products',
  })
  @IsOptional()
  @IsString()
  description?: string;


  @ApiPropertyOptional({
    description: 'Assign section to Checker',
    example: 2,
  })
  @IsNotEmpty()
  @IsInt()
  assigneeId: number;
}
