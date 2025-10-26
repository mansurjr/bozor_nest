import { PartialType } from '@nestjs/swagger';
import { CreateAttendanceDto } from './create-attendance.dto';
import { IsOptional, IsEnum, IsNumber } from 'class-validator';
import { AttendancePayment } from '@prisma/client';

export class UpdateAttendanceDto extends PartialType(CreateAttendanceDto) {
  @IsOptional()
  @IsEnum(AttendancePayment)
  status?: AttendancePayment;

  @IsOptional()
  @IsNumber()
  amount?: number;
}
