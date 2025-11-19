import { ContractPaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePaymentPeriodDto {
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  months?: number = 1;

  @IsOptional()
  @IsEnum(ContractPaymentStatus)
  status?: ContractPaymentStatus;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsInt()
  transactionId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

