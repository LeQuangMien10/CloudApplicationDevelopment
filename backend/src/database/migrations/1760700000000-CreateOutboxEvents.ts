import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F5 Phase 2: bảng outbox_events — hàng đợi sự kiện cho worker (ADR 007).
 *
 * - Chuyển khoản thành công ghi sự kiện trong cùng DB transaction: commit thì có sự kiện,
 *   rollback thì không, nên sự kiện không bị mất khi backend chết ngay sau commit.
 * - Không phải bảng chỉ thêm dòng: worker cập nhật status, attempts, available_at, nên
 *   banking_app có SELECT, INSERT, UPDATE. Chưa cấp DELETE, việc dọn sự kiện cũ làm sau.
 * - payload không có khóa ngoại tới transactions để bảng dùng được cho nhiều loại sự kiện.
 * - last_error lưu lỗi gần nhất của handler để debug sự kiện bị failed.
 */
export class CreateOutboxEvents1760700000000 implements MigrationInterface {
  name = 'CreateOutboxEvents1760700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type varchar(50) NOT NULL,
        payload jsonb NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        CONSTRAINT chk_outbox_events_status CHECK (status IN ('pending', 'done', 'failed')),
        CONSTRAINT chk_outbox_events_attempts_non_negative CHECK (attempts >= 0)
      );
    `);

    // Câu poll của worker chỉ quét sự kiện pending đã đến hạn
    await q.query(
      `CREATE INDEX idx_outbox_events_pending ON outbox_events (available_at) WHERE status = 'pending'`,
    );

    await q.query(`REVOKE ALL ON outbox_events FROM PUBLIC`);
    await q.query(`GRANT SELECT, INSERT, UPDATE ON outbox_events TO banking_app`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`REVOKE ALL ON outbox_events FROM banking_app`);
    await q.query(`DROP TABLE outbox_events`);
  }
}
