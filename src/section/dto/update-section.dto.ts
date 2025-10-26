import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSectionDto } from './create-section.dto';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateSectionDto extends PartialType(CreateSectionDto) {
  @ApiPropertyOptional({
    description: 'Updated name of the section',
    example: 'Home Electronics',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description of the section',
    example: 'Updated section description',
  })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({
    description: 'Update Assign section to Checker',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  assigneeId?: number;
}
