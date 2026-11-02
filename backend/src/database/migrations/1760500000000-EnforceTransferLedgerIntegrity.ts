import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Enforce transfer postings at database commit time. */
export class EnforceTransferLedgerIntegrity1760500000000
  implements MigrationInterface
{
  name = 'EnforceTransferLedgerIntegrity1760500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION assert_completed_transfer_ledger(p_transaction_id uuid)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE
        transfer_row transactions%ROWTYPE;
        entry_count integer;
        debit_count integer;
        credit_count integer;
        debit_amount numeric(18,2);
        credit_amount numeric(18,2);
        debit_account_id uuid;
        credit_account_id uuid;
      BEGIN
        SELECT * INTO transfer_row FROM transactions WHERE id = p_transaction_id;
        IF NOT FOUND OR transfer_row.type <> 'transfer'
          OR transfer_row.status <> 'completed' THEN
          RETURN;
        END IF;

        SELECT
          count(*)::integer,
          count(*) FILTER (WHERE direction = 'debit'::ledger_direction)::integer,
          count(*) FILTER (WHERE direction = 'credit'::ledger_direction)::integer,
          max(amount) FILTER (WHERE direction = 'debit'::ledger_direction),
          max(amount) FILTER (WHERE direction = 'credit'::ledger_direction),
          (array_agg(account_id) FILTER (WHERE direction = 'debit'::ledger_direction))[1],
          (array_agg(account_id) FILTER (WHERE direction = 'credit'::ledger_direction))[1]
        INTO entry_count, debit_count, credit_count, debit_amount, credit_amount,
          debit_account_id, credit_account_id
        FROM ledger_entries
        WHERE transaction_id = p_transaction_id;

        IF entry_count <> 2 OR debit_count <> 1 OR credit_count <> 1
          OR debit_amount IS DISTINCT FROM credit_amount
          OR debit_amount IS DISTINCT FROM transfer_row.amount
          OR debit_account_id IS DISTINCT FROM transfer_row.from_account_id
          OR credit_account_id IS DISTINCT FROM transfer_row.to_account_id THEN
          RAISE EXCEPTION
            'completed transfer % must have one balanced debit and one balanced credit',
            p_transaction_id USING ERRCODE = '23514';
        END IF;
      END;
      $$;
    `);

    await q.query(`
      CREATE OR REPLACE FUNCTION validate_completed_transfer_ledger_trigger()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        affected_transaction_id uuid;
      BEGIN
        IF TG_TABLE_NAME = 'ledger_entries' THEN
          affected_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
        ELSE
          affected_transaction_id := NEW.id;
        END IF;
        PERFORM assert_completed_transfer_ledger(affected_transaction_id);
        RETURN NULL;
      END;
      $$;
    `);

    await q.query(`
      CREATE CONSTRAINT TRIGGER trg_ledger_entries_balanced_at_commit
      AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION validate_completed_transfer_ledger_trigger();
    `);
    await q.query(`
      CREATE CONSTRAINT TRIGGER trg_completed_transfer_has_ledger_at_commit
      AFTER INSERT OR UPDATE ON transactions
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
      EXECUTE FUNCTION validate_completed_transfer_ledger_trigger();
    `);

    await q.query(`
      CREATE OR REPLACE FUNCTION prevent_ledger_entry_mutation()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('app.ledger_maintenance', true) = 'on' THEN
          RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        RAISE EXCEPTION 'ledger_entries are append-only' USING ERRCODE = '55000';
      END;
      $$;
    `);
    await q.query(`
      CREATE TRIGGER trg_ledger_entries_append_only
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_mutation();
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER trg_ledger_entries_append_only ON ledger_entries`);
    await q.query(`DROP FUNCTION prevent_ledger_entry_mutation()`);
    await q.query(`DROP TRIGGER trg_completed_transfer_has_ledger_at_commit ON transactions`);
    await q.query(`DROP TRIGGER trg_ledger_entries_balanced_at_commit ON ledger_entries`);
    await q.query(`DROP FUNCTION validate_completed_transfer_ledger_trigger()`);
    await q.query(`DROP FUNCTION assert_completed_transfer_ledger(uuid)`);
  }
}
