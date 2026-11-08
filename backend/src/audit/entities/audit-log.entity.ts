import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { User } from '../../users/entities/user.entity.js';

/** Hằng số action của audit log. Thêm action mới không cần migration (cột varchar). */
export enum AuditAction {
  AUTH_REGISTER = 'auth_register',
  AUTH_LOGIN_SUCCESS = 'auth_login_success',
  AUTH_LOGIN_FAILED = 'auth_login_failed',
  USER_LOCKED = 'user_locked',
  USER_UNLOCKED = 'user_unlocked',
  ACCOUNT_FROZEN = 'account_frozen',
  ACCOUNT_UNFROZEN = 'account_unfrozen',
}

export type AuditTargetType = 'user' | 'account' | 'transaction' | 'fraud_flag';

@Entity('audit_logs')
@Index('idx_audit_logs_actor_created', ['actorId', 'createdAt'])
@Index('idx_audit_logs_action_created', ['action', 'createdAt'])
@Index('idx_audit_logs_request_id', ['requestId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** null khi hành động xảy ra trước khi xác thực (vd. đăng nhập sai email). */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne('User', { onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'audit_logs_actor_id_fkey',
  })
  actor: Relation<User>;

  /** Vai trò của actor tại thời điểm hành động. */
  @Column({ name: 'actor_role', type: 'varchar', length: 20, nullable: true })
  actorRole: string | null;

  @Column({ type: 'varchar', length: 50 })
  action: AuditAction;

  @Column({ name: 'target_type', type: 'varchar', length: 30, nullable: true })
  targetType: AuditTargetType | null;

  /** uuid hoặc số tài khoản, tùy target_type. */
  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  /** Từ RequestIdMiddleware, không phải uuid để chấp nhận header client gửi. */
  @Column({ name: 'request_id', type: 'varchar', length: 64 })
  requestId: string;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  /** KHÔNG ghi mật khẩu, token vào đây. Chỉ truyền object có trường định nghĩa sẵn. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
