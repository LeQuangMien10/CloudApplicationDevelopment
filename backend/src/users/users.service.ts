import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { User, UserStatus } from './entities/user.entity.js';

/** Phụ trách: TV2 Châu Anh */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /** Lấy cả passwordHash (mặc định cột này bị ẩn) để AuthService kiểm tra mật khẩu. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  /** Dùng bởi JwtStrategy để kiểm tra trạng thái mỗi request. */
  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** Danh sách user mới nhất trước. passwordHash bị ẩn sẵn bởi select:false. */
  async findPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: User[]; total: number; page: number; limit: number }> {
    const [items, total] = await this.users.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items, total, page, limit };
  }

  /**
   * Trả null nếu không có user với id tương ứng.
   * Đổi trạng thái và audit log chạy trong cùng DB transaction: thao tác rollback
   * thì log cũng rollback, không có log "khóa user" cho một thao tác không thành công.
   */
  async updateStatus(
    id: string,
    status: UserStatus,
    actor: { id: string; role: string },
  ): Promise<User | null> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.preload(User, { id, status });
      if (!user) return null;
      await manager.save(user);
      await this.auditService.log(manager, {
        actorId: actor.id,
        actorRole: actor.role,
        action:
          status === UserStatus.LOCKED
            ? AuditAction.USER_LOCKED
            : AuditAction.USER_UNLOCKED,
        targetType: 'user',
        targetId: id,
        metadata: { newStatus: status },
      });
      return user;
    });
  }
}
