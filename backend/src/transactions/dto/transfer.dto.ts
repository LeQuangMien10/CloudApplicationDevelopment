import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { AMOUNT_REGEX } from '../../common/money.js';

export class TransferDto {
  @ApiProperty({
    description: 'id tài khoản nguồn, phải thuộc user đang đăng nhập',
  })
  @IsUUID()
  fromAccountId: string;

  @ApiProperty({ example: '100000000002' })
  @Matches(/^[0-9]{12}$/, { message: 'toAccountNumber phải gồm 12 chữ số' })
  toAccountNumber: string;

  @ApiProperty({
    example: '1500000.00',
    description: 'Chuỗi số dương, tối đa 2 chữ số thập phân',
  })
  @IsString()
  @Matches(AMOUNT_REGEX, {
    message: 'amount phải lớn hơn 0 và tối đa 2 chữ số thập phân',
  })
  amount: string;

  @ApiPropertyOptional({ example: 'Trả tiền ăn trưa' })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  description?: string;
}
