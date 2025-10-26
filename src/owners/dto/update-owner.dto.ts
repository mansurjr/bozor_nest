import { PartialType } from '@nestjs/swagger';
import { CreateOwnerDto } from './create-owner.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOwnerDto extends PartialType(CreateOwnerDto) {
  @ApiPropertyOptional({ description: 'Is active', example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
