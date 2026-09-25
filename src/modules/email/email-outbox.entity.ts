import { EntitySchema } from 'typeorm'
import type { TemplateName } from './templates/index.ts'

export type EmailOutbox = {
  id: string; template: TemplateName; to_email: string; data: any; dedupe_key: string | null
  attempts: number; next_attempt_at: Date; last_error: string | null
  provider_message_id: string | null; sent_at: Date | null; created_at: Date
}

export const EmailOutboxEntity = new EntitySchema<EmailOutbox>({
  name: 'EmailOutbox', tableName: 'email_outbox',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    template: { type: 'text' },
    to_email: { type: 'text' },
    data: { type: 'jsonb' },
    dedupe_key: { type: 'text', nullable: true, unique: true },
    attempts: { type: 'integer', default: 0 },
    next_attempt_at: { type: 'timestamptz' },
    last_error: { type: 'text', nullable: true },
    provider_message_id: { type: 'text', nullable: true },
    sent_at: { type: 'timestamptz', nullable: true },
    created_at: { type: 'timestamptz', createDate: true },
  },
})
