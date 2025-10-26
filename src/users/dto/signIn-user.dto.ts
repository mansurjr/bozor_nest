import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AuthDto {
  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  @IsString()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'strongPassword123',
  })
  @IsString()
  password: string;
}
