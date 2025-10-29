import { PartialType } from '@nestjs/swagger';
import { CreateContractDto } from './create-contract.dto';
import { IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class UpdateContractDto extends PartialType(CreateContractDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  shopMonthlyFee?: number;
}
