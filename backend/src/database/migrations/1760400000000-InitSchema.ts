import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema Phase 1. Đã có sẵn nền móng cho Phase 2:
 * trạng thái tài khoản, trạng thái giao dịch, sổ cái kép, idempotency key.
 */
export class InitSchema1760400000000 implements MigrationInterface {
  name = 'InitSchema1760400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE user_role AS ENUM ('customer', 'admin')`);
    await q.query(`CREATE TYPE user_status AS ENUM ('active', 'locked')`);
    await q.query(
      `CREATE TYPE account_status AS ENUM ('active', 'frozen', 'closed')`,
    );
    await q.query(
      `CREATE TYPE transaction_type AS ENUM ('transfer', 'deposit')`,
    );
    await q.query(
      `CREATE TYPE transaction_status AS ENUM ('processing', 'completed', 'failed')`,
    );
    await q.query(`CREATE TYPE ledger_direction AS ENUM ('debit', 'credit')`);

    await q.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name     varchar(100) NOT NULL,
        email         varchar(255) NOT NULL UNIQUE,
        password_hash varchar(255) NOT NULL,
        role          user_role    NOT NULL DEFAULT 'customer',
        status        user_status  NOT NULL DEFAULT 'active',
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE accounts (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        account_number varchar(12)    NOT NULL UNIQUE,
        balance        numeric(18,2)  NOT NULL DEFAULT 0,
        currency       char(3)        NOT NULL DEFAULT 'VND',
        status         account_status NOT NULL DEFAULT 'active',
        is_system      boolean        NOT NULL DEFAULT false,
        version        int            NOT NULL DEFAULT 1,
        created_at     timestamptz    NOT NULL DEFAULT now(),
        updated_at     timestamptz    NOT NULL DEFAULT now(),
        CONSTRAINT chk_accounts_number_digits CHECK (account_number ~ '^[0-9]{12}$'),
        CONSTRAINT chk_accounts_balance_non_negative CHECK (is_system OR balance >= 0)
      )`);
    await q.query(`CREATE INDEX idx_accounts_user_id ON accounts (user_id)`);

    await q.query(`
      CREATE TABLE transactions (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type            transaction_type   NOT NULL,
        status          transaction_status NOT NULL DEFAULT 'processing',
        from_account_id uuid NOT NULL REFERENCES accounts(id),
        to_account_id   uuid NOT NULL REFERENCES accounts(id),
        amount          numeric(18,2) NOT NULL,
        description     varchar(140),
        failure_reason  varchar(100),
        initiated_by    uuid REFERENCES users(id),
        created_at      timestamptz NOT NULL DEFAULT now(),
        completed_at    timestamptz,
        CONSTRAINT chk_transactions_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_transactions_different_accounts CHECK (from_account_id <> to_account_id)
      )`);
    await q.query(
      `CREATE INDEX idx_transactions_from ON transactions (from_account_id, created_at DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_transactions_to ON transactions (to_account_id, created_at DESC)`,
    );
    await q.query(
      `CREATE INDEX idx_transactions_status ON transactions (status, created_at)`,
    );

    await q.query(`
      CREATE TABLE ledger_entries (
        id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        transaction_id uuid NOT NULL REFERENCES transactions(id),
        account_id     uuid NOT NULL REFERENCES accounts(id),
        direction      ledger_direction NOT NULL,
        amount         numeric(18,2) NOT NULL,
        balance_after  numeric(18,2) NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT uq_ledger_transaction_direction UNIQUE (transaction_id, direction)
      )`);
    await q.query(
      `CREATE INDEX idx_ledger_account ON ledger_entries (account_id, id DESC)`,
    );

    await q.query(`
      CREATE TABLE idempotency_keys (
        user_id        uuid NOT NULL REFERENCES users(id),
        key            varchar(64) NOT NULL,
        request_hash   char(64)    NOT NULL,
        transaction_id uuid REFERENCES transactions(id),
        response_code  int,
        response_body  jsonb,
        created_at     timestamptz NOT NULL DEFAULT now(),
        expires_at     timestamptz NOT NULL,
        PRIMARY KEY (user_id, key)
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE idempotency_keys`);
    await q.query(`DROP TABLE ledger_entries`);
    await q.query(`DROP TABLE transactions`);
    await q.query(`DROP TABLE accounts`);
    await q.query(`DROP TABLE users`);
    await q.query(`DROP TYPE ledger_direction`);
    await q.query(`DROP TYPE transaction_status`);
    await q.query(`DROP TYPE transaction_type`);
    await q.query(`DROP TYPE account_status`);
    await q.query(`DROP TYPE user_status`);
    await q.query(`DROP TYPE user_role`);
  }
}
