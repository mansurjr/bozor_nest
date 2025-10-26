import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOwnerDto {
  @ApiProperty({ description: 'Full name of the owner', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ description: 'Address of the owner', example: '123 Main St' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Tax Identification Number (unique)', example: '123456789' })
  @IsString()
  @IsNotEmpty()
  tin: string;

  @ApiPropertyOptional({ description: 'Phone number of the owner', example: '+998901234567' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
