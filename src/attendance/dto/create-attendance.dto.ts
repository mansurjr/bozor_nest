import { IsDateString, IsInt, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendancePayment } from '@prisma/client';

export class CreateAttendanceDto {
  @ApiProperty({ description: 'Date of the attendance', example: '2025-10-27' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'ID of the Stall', example: 1 })
  @IsInt()
  stallId: number;

  @ApiPropertyOptional({ description: 'Attendance status', enum: AttendancePayment, default: AttendancePayment.UNPAID })
  @IsOptional()
  @IsEnum(AttendancePayment)
  status?: AttendancePayment = AttendancePayment.UNPAID;

  @ApiPropertyOptional({ description: 'Amount paid', example: 100 })
  @IsOptional()
  amount?: number;
}
