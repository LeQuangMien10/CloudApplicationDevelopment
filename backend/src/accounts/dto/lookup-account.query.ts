import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class LookupAccountQuery {
  @ApiProperty({ example: '100000000001', description: 'Số tài khoản gồm 12 chữ số' })
  @Matches(/^[0-9]{12}$/, { message: 'accountNumber phải gồm 12 chữ số' })
  accountNumber: string;
}
