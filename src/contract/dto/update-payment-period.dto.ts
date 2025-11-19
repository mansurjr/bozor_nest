import { ContractPaymentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdatePaymentPeriodDto {
  @IsOptional()
  @IsEnum(ContractPaymentStatus)
  status?: ContractPaymentStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' ? null : Number(value)))
  @IsInt()
  transactionId?: number | null;
}

