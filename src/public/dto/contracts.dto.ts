// src/pay/dto/get-contracts.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class GetContractsDto {
  @ApiPropertyOptional({
    description: 'Store number (identifier of the store)',
    example: 'S001',
  })
  @IsOptional()
  @IsString()
  storeNumber?: string;

  @ApiPropertyOptional({
    description: 'TIN (Tax Identification Number)',
    example: '123123',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'TIN must contain only digits' })
  @Length(6, 15, { message: 'TIN must be between 6 and 15 digits long' })
  tin?: string;
}
