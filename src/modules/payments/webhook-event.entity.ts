import { EntitySchema } from 'typeorm'

// One row per processed gateway event. The PK is the idempotency key (Scenario E).
export type WebhookEvent = { event_key: string; event: string; reference: string | null; payload: unknown; received_at: Date }

export const WebhookEventEntity = new EntitySchema<WebhookEvent>({
  name: 'WebhookEvent', tableName: 'webhook_events',
  columns: {
    event_key: { type: 'text', primary: true },
    event: { type: 'text' },
    reference: { type: 'text', nullable: true },
    payload: { type: 'jsonb' },
    received_at: { type: 'timestamptz', createDate: true },
  },
})
