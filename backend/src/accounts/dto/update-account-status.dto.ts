import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, ValidateIf } from 'class-validator';
import { AccountStatus } from '../entities/account.entity.js';

/** F3: operator chỉ được khóa (frozen) và mở (active), không đóng tài khoản qua API này. */
const ALLOWED_STATUSES = [AccountStatus.FROZEN, AccountStatus.ACTIVE];

export class UpdateAccountStatusDto {
  @ApiProperty({ enum: ALLOWED_STATUSES, example: AccountStatus.FROZEN })
  @IsIn(ALLOWED_STATUSES, {
    message: 'status chỉ nhận "frozen" hoặc "active"',
  })
  status: AccountStatus;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Lý do, bắt buộc khi khóa tài khoản',
    example: 'Nghi ngờ gian lận, chờ điều tra',
  })
  @ValidateIf(
    (o: UpdateAccountStatusDto) =>
      o.status === AccountStatus.FROZEN ||
      (o.reason !== undefined && o.reason !== null),
  )
  @IsString({ message: 'reason phải là chuỗi' })
  @Length(1, 500, { message: 'reason phải từ 1 đến 500 ký tự' })
  reason?: string;
}
