import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumberString, IsInt, IsNumber } from 'class-validator';

export class ClickDataDto {
  @ApiProperty({ description: 'Click transaction ID' })
  @IsString()
  click_trans_id: string;

  @ApiProperty({ description: 'Service ID' })
  @IsString()
  service_id: string;

  @ApiPropertyOptional({ description: 'Click paydoc ID' })
  @IsOptional()
  @IsString()
  click_paydoc_id?: string;

  @ApiProperty({ description: 'Merchant transaction ID (attendance or transaction ID)' })
  @IsString()
  merchant_trans_id: string;

  @ApiProperty({ description: 'Transaction amount as string' })
  @IsNumberString()
  amount: string;

  @ApiProperty({ description: 'Action code: 0=Prepare, 1=Complete' })
  @IsInt()
  action: number;

  @ApiProperty({ description: 'Signature timestamp' })
  @IsString()
  sign_time: string;

  @ApiPropertyOptional({ description: 'Error code, if any' })
  @IsOptional()
  @IsNumber()
  error?: number;

  @ApiPropertyOptional({ description: 'Merchant prepare ID (from Prepare response)' })
  @IsOptional()
  @IsString()
  merchant_prepare_id?: string;

  @ApiPropertyOptional({ description: 'Signature string for verification' })
  @IsOptional()
  @IsString()
  sign_string?: string;
}
