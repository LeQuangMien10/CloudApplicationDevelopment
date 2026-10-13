import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';

export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

@Entity('accounts')
@Check('chk_accounts_number_digits', `account_number ~ '^[0-9]{12}$'`)
@Check('chk_accounts_balance_non_negative', `is_system OR balance >= 0`)
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_accounts_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne('User', 'accounts', { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'accounts_user_id_fkey',
  })
  user: Relation<User>;

  /** 12 chữ số, tự sinh. */
  @Column({ name: 'account_number', type: 'varchar', length: 12, unique: true })
  accountNumber: string;

  /** numeric(18,2) trả về dạng string. Xem common/money.ts. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  balance: string;

  @Column({ type: 'char', length: 3, default: 'VND' })
  currency: string;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'account_status',
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  /** Tài khoản quỹ của ngân hàng, dùng làm nguồn tiền khi nạp tiền. Được phép âm. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @VersionColumn({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
