import type { MigrationInterface, QueryRunner } from 'typeorm'

export class Email1727100000000 implements MigrationInterface {
  name = 'Email1727100000000'
  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
      -- Accounts that existed before sign-up codes were introduced are treated as verified.
      UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

      -- Transactional outbox: rows are written in the same transaction as the state change that
      -- causes them, so an email is queued exactly once and never for a rolled-back change.
      CREATE TABLE IF NOT EXISTS email_outbox (
        id                  bigserial PRIMARY KEY,
        template            text NOT NULL,
        to_email            text NOT NULL,
        data                jsonb NOT NULL,
        dedupe_key          text UNIQUE,
        attempts            integer NOT NULL DEFAULT 0,
        next_attempt_at     timestamptz NOT NULL DEFAULT now(),
        last_error          text,
        provider_message_id text,
        sent_at             timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox (next_attempt_at) WHERE sent_at IS NULL;
    `)
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE IF EXISTS email_outbox; ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;')
  }
}
