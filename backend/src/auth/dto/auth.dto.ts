import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const toLowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'an@example.com' })
  @Transform(toLowerTrim)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'Password@123',
    description: 'Ít nhất 8 ký tự, có chữ và số',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password phải có cả chữ và số',
  })
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'an@example.com' })
  @Transform(toLowerTrim)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password@123' })
  @IsString()
  @MaxLength(72)
  password: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 900, description: 'Số giây token còn hiệu lực' })
  expiresIn: number;
}
