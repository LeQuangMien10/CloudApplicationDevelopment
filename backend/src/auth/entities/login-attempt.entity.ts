import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Một lần thử đăng nhập (F9). Bảng append-only bằng GRANT: banking_app không có UPDATE/DELETE. */
@Entity('login_attempts')
@Index('idx_login_attempts_email_created', ['emailNorm', 'createdAt'])
export class LoginAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Email đã chuẩn hóa (chữ thường) để khớp cách UsersService tra cứu. */
  @Column({ name: 'email_norm', type: 'varchar', length: 255 })
  emailNorm: string;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ type: 'boolean' })
  success: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
