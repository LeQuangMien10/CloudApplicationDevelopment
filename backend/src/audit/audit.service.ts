import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { getRequestContext } from '../common/request-context.js';
import { ListAuditLogsQuery } from './dto/list-audit-logs.query.js';
import {
  AuditAction,
  AuditLog,
  AuditTargetType,
} from './entities/audit-log.entity.js';

/** Thông tin một dòng audit log. metadata chỉ chứa dữ liệu an toàn, không mật khẩu/token. */
export interface AuditEntryInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: AuditAction;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Phụ trách: TV2 Châu Anh. Các module khác gọi để ghi log kiểm toán. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  /**
   * Ghi log TRONG transaction của thao tác: log và dữ liệu commit/rollback cùng nhau.
   * Lỗi ghi log sẽ làm rollback cả thao tác — đúng nghĩa "log và thao tác nhất quán".
   */
  async log(manager: EntityManager, entry: AuditEntryInput): Promise<void> {
    const ctx = getRequestContext();
    await manager.insert(AuditLog, {
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      requestId: ctx?.requestId ?? 'no-request-context',
      ip: ctx?.ip ?? null,
      // Cast: TypeORM không map được Record<string, unknown> vào kiểu insert của cột jsonb
      metadata: (entry.metadata ?? {}) as object,
    });
  }

  /**
   * Ghi log độc lập khi không có transaction bao ngoài (vd. đăng nhập thất bại).
   * Lỗi ghi log không làm hỏng nghiệp vụ — chỉ log warning.
   */
  async logStandalone(entry: AuditEntryInput): Promise<void> {
    try {
      await this.dataSource.transaction((manager) => this.log(manager, entry));
    } catch (err) {
      this.logger.warn(
        `Ghi audit log thất bại cho action ${entry.action}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /** Tra cứu cho auditor/admin, mới nhất trước, có bộ lọc và phân trang. */
  async findPaginated(query: ListAuditLogsQuery): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.auditLogs.createQueryBuilder('a');

    if (query.actorId) qb.andWhere('a.actorId = :actorId', { actorId: query.actorId });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.requestId)
      qb.andWhere('a.requestId = :requestId', { requestId: query.requestId });
    if (query.from)
      qb.andWhere('a.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: query.to });

    const [items, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return { items, total, page: query.page, limit: query.limit };
  }
}
