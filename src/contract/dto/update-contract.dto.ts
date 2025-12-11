import { PartialType } from '@nestjs/swagger';
import { CreateContractDto } from './create-contract.dto';
import { IsOptional, IsBoolean, IsNumber, IsEnum } from 'class-validator';
import { ContractPaymentType } from '@prisma/client';

export class UpdateContractDto extends PartialType(CreateContractDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  shopMonthlyFee?: number;

  @IsOptional()
  @IsEnum(ContractPaymentType)
  paymentType?: ContractPaymentType;
}
