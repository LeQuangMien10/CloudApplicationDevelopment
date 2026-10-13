import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../entities/user.entity.js';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.LOCKED })
  @IsEnum(UserStatus)
  status: UserStatus;
}
