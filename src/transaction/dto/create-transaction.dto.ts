import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';


export class CreateTransactionDto {
  @IsString()
  transactionId: string;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod = PaymentMethod.CASH;

  @IsOptional()
  @IsNumber()
  contractId?: number;

  @IsOptional()
  @IsNumber()
  attendanceId?: number;
}

