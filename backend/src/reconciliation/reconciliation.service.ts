import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '../audit/entities/audit-log.entity.js';
import type { RequestUser } from '../auth/jwt.strategy.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { ListReconciliationReportsQuery } from './dto/list-reconciliation-reports.query.js';
import {
  type AccountMismatch,
  ReconciliationReport,
  ReconciliationStatus,
  ReconciliationTrigger,
  type TransactionMismatch,
  TransactionProblem,
} from './entities/reconciliation-report.entity.js';
import {
  MAX_DETAIL_ITEMS,
  type ReconciliationCheckResult,
  summarizeReconciliation,
} from './reconciliation.summary.js';

/** Khóa advisory để hai lần đối soát không chạy cùng lúc. Số cố định, chỉ dùng cho F7. */
const RECONCILIATION_LOCK_KEY = 7_007_001;

/** Giao dịch processing lâu hơn mức này bị coi là treo. */
const STUCK_PROCESSING_MINUTES = 15;

export interface RunReconciliationInput {
  trigger: ReconciliationTrigger;
  /** Bắt buộc khi chạy tay, để ghi audit log */
  actor?: RequestUser;
}

/**
 * Phụ trách: TV1 Miền. Đối soát số dư với sổ cái (F7).
 *
 * Ba kiểm tra:
 * 1. Mỗi tài khoản: balance = tổng credit - tổng debit = balance_after của dòng sổ cái mới nhất.
 * 2. Tổng số dư mọi tài khoản, kể cả tài khoản hệ thống, bằng 0.
 * 3. Mỗi giao dịch completed có đúng 1 debit ở tài khoản nguồn và 1 credit ở tài khoản đích,
 *    cùng số tiền với giao dịch. Giao dịch failed, processing không có dòng sổ cái nào.
 *    Giao dịch processing quá 15 phút là giao dịch treo.
 *
 * Trigger ở DB chỉ chặn chuyển khoản completed thiếu sổ cái lúc commit. Đối soát là lớp kiểm tra
 * độc lập, phát hiện cả lệch do sửa tay, do nạp tiền (deposit) và do lỗi chưa biết.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @InjectRepository(ReconciliationReport)
    private readonly reports: Repository<ReconciliationReport>,
  ) {}

  /**
   * Chạy đối soát và lưu báo cáo.
   *
   * Không báo lệch giả khi đang có chuyển tiền: mỗi kiểm tra là MỘT câu SQL, so số dư với sổ cái
   * ngay trong câu đó, nên luôn đọc trên một snapshot. Đừng tách thành nhiều câu (ví dụ đọc
   * số dư rồi mới đọc sổ cái), vì giữa hai câu có thể có lệnh chuyển tiền commit.
   *
   * REPEATABLE READ để cả 3 kiểm tra và các con số đếm cùng phản ánh một thời điểm (run_at).
   * Không khóa bảng nào, chuyển tiền vẫn chạy bình thường trong lúc đối soát.
   */
  async run(input: RunReconciliationInput): Promise<ReconciliationReport> {
    const startedAt = Date.now();

    const report = await this.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const [{ locked }] = (await manager.query(
          `SELECT pg_try_advisory_xact_lock($1::bigint) AS locked`,
          [RECONCILIATION_LOCK_KEY],
        )) as { locked: boolean }[];
        if (!locked) {
          throw new AppException(
            'RECONCILIATION_IN_PROGRESS',
            'Đang có một lần đối soát khác chạy, thử lại sau',
            HttpStatus.CONFLICT,
          );
        }

        const result = await this.check(manager);
        const { status, details } = summarizeReconciliation(result);

        const saved = await manager.save(
          manager.create(ReconciliationReport, {
            trigger: input.trigger,
            triggeredBy: input.actor?.id ?? null,
            status,
            accountsChecked: result.accountsChecked,
            mismatchedAccounts: result.mismatchedAccounts,
            totalBalance: result.totalBalance,
            transactionsChecked: result.transactionsChecked,
            invalidTransactions: result.invalidTransactions,
            details,
            durationMs: Date.now() - startedAt,
          }),
        );

        if (input.actor) {
          await this.auditService.log(manager, {
            actorId: input.actor.id,
            actorRole: input.actor.role,
            action: AuditAction.RECONCILIATION_RUN,
            targetType: 'reconciliation_report',
            targetId: saved.id,
            metadata: {
              status,
              mismatchedAccounts: result.mismatchedAccounts,
              invalidTransactions: result.invalidTransactions,
              totalBalance: result.totalBalance,
            },
          });
        }
        return saved;
      },
    );

    if (report.status === ReconciliationStatus.MISMATCH) {
      this.logger.warn(
        `Đối soát ${report.id} phát hiện lệch: ${report.mismatchedAccounts} tài khoản, ` +
          `${report.invalidTransactions} giao dịch, tổng số dư ${report.totalBalance}`,
      );
    }
    return report;
  }

  /** Chạy 3 kiểm tra trên snapshot của transaction hiện tại. */
  private async check(
    manager: EntityManager,
  ): Promise<ReconciliationCheckResult> {
    const [totals] = (await manager.query(`
      SELECT count(*)::int AS "accountsChecked",
             COALESCE(sum(balance), 0)::numeric(18,2)::text AS "totalBalance",
             COALESCE(sum(balance), 0) = 0 AS "totalBalanceIsZero"
      FROM accounts
    `)) as {
      accountsChecked: number;
      totalBalance: string;
      totalBalanceIsZero: boolean;
    }[];

    // Kiểm tra 1: lấy tối đa MAX_DETAIL_ITEMS tài khoản lệch, count(*) OVER () là tổng số lệch
    const accountRows = (await manager.query(
      `
      WITH ledger AS (
        SELECT account_id,
               sum(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS ledger_balance
        FROM ledger_entries
        GROUP BY account_id
      ),
      checked AS (
        SELECT a.id, a.account_number, a.balance,
               COALESCE(l.ledger_balance, 0) AS ledger_balance,
               last_entry.balance_after AS last_balance_after
        FROM accounts a
        LEFT JOIN ledger l ON l.account_id = a.id
        -- Dòng mới nhất theo id: id là identity, tăng theo thứ tự ghi trên cùng tài khoản
        -- vì chuyển tiền đã khóa dòng tài khoản trước khi ghi sổ cái
        LEFT JOIN LATERAL (
          SELECT le.balance_after FROM ledger_entries le
          WHERE le.account_id = a.id
          ORDER BY le.id DESC
          LIMIT 1
        ) last_entry ON true
      )
      SELECT id AS "accountId",
             account_number AS "accountNumber",
             balance::text AS "balance",
             ledger_balance::numeric(18,2)::text AS "ledgerBalance",
             last_balance_after::text AS "lastBalanceAfter",
             count(*) OVER ()::int AS "totalMismatches"
      FROM checked
      WHERE balance <> ledger_balance
         OR balance IS DISTINCT FROM COALESCE(last_balance_after, 0)
      ORDER BY account_number
      LIMIT $1
      `,
      [MAX_DETAIL_ITEMS],
    )) as (AccountMismatch & { totalMismatches: number })[];

    const [{ transactionsChecked }] = (await manager.query(
      `SELECT count(*)::int AS "transactionsChecked" FROM transactions`,
    )) as { transactionsChecked: number }[];

    // Kiểm tra 3
    const transactionRows = (await manager.query(
      `
      WITH entries AS (
        SELECT t.id, t.type, t.status, t.amount, t.created_at,
               count(le.id)::int AS entry_count,
               count(*) FILTER (
                 WHERE le.direction = 'debit' AND le.account_id = t.from_account_id
                   AND le.amount = t.amount
               ) AS valid_debits,
               count(*) FILTER (
                 WHERE le.direction = 'credit' AND le.account_id = t.to_account_id
                   AND le.amount = t.amount
               ) AS valid_credits
        FROM transactions t
        LEFT JOIN ledger_entries le ON le.transaction_id = t.id
        GROUP BY t.id
      ),
      problems AS (
        SELECT *,
               CASE
                 WHEN status = 'completed'
                      AND NOT (entry_count = 2 AND valid_debits = 1 AND valid_credits = 1)
                   THEN $2::text
                 WHEN status <> 'completed' AND entry_count > 0
                   THEN $3::text
                 WHEN status = 'processing'
                      AND created_at < now() - make_interval(mins => $4::int)
                   THEN $5::text
               END AS problem
        FROM entries
      )
      SELECT id AS "transactionId",
             type::text AS "type",
             status::text AS "status",
             amount::text AS "amount",
             entry_count AS "entryCount",
             problem AS "problem",
             count(*) OVER ()::int AS "totalMismatches"
      FROM problems
      WHERE problem IS NOT NULL
      ORDER BY created_at
      LIMIT $1::int
      `,
      [
        MAX_DETAIL_ITEMS,
        TransactionProblem.LEDGER_MISSING_OR_UNBALANCED,
        TransactionProblem.LEDGER_ON_NOT_COMPLETED,
        STUCK_PROCESSING_MINUTES,
        TransactionProblem.STUCK_PROCESSING,
      ],
    )) as (TransactionMismatch & { totalMismatches: number })[];

    return {
      accountsChecked: totals.accountsChecked,
      totalBalance: totals.totalBalance,
      totalBalanceIsZero: totals.totalBalanceIsZero,
      mismatchedAccounts: accountRows[0]?.totalMismatches ?? 0,
      accountMismatches: accountRows.map(
        ({ totalMismatches: _total, ...row }) => row,
      ),
      transactionsChecked,
      invalidTransactions: transactionRows[0]?.totalMismatches ?? 0,
      transactionMismatches: transactionRows.map(
        ({ totalMismatches: _total, ...row }) => row,
      ),
    };
  }

  /** Danh sách báo cáo mới nhất trước, cho auditor và admin. */
  async findPaginated(query: ListReconciliationReportsQuery) {
    const qb = this.reports.createQueryBuilder('r');
    if (query.status) qb.where('r.status = :status', { status: query.status });

    const [items, total] = await qb
      .orderBy('r.runAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string): Promise<ReconciliationReport> {
    const report = await this.reports.findOneBy({ id });
    if (!report) {
      throw new AppException(
        'RECONCILIATION_REPORT_NOT_FOUND',
        'Không tìm thấy báo cáo đối soát',
        HttpStatus.NOT_FOUND,
      );
    }
    return report;
  }
}
