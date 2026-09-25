import type { EntityManager } from 'typeorm'
import { tx } from '../../database/data-source.ts'
import { sendEmail } from './brevo.client.ts'
import { EmailOutboxEntity } from './email-outbox.entity.ts'
import { render, type TemplateData, type TemplateName } from './templates/index.ts'

const MAX_ATTEMPTS = 8
const BATCH = 20

/**
 * Queue an email inside the caller's transaction. The dedupe key makes it idempotent:
 * a duplicate webhook that re-runs the same transition queues nothing new.
 */
export async function enqueue<T extends TemplateName>(m: EntityManager, template: T, to: string, data: TemplateData<T>, dedupeKey: string) {
  await m.createQueryBuilder().insert().into(EmailOutboxEntity)
    .values({ template, to_email: to, data: data as object, dedupe_key: dedupeKey, next_attempt_at: new Date() })
    .orIgnore()
    .execute()
}

/** Send right now, bypassing the queue. For sign-up codes, where the user is waiting on the response. */
export function sendNow<T extends TemplateName>(template: T, to: string, data: TemplateData<T>) {
  return sendEmail({ to, ...render(template, data) })
}

/**
 * Worker: claim due rows with SKIP LOCKED (safe with any number of workers), send, record the outcome.
 * Failures back off exponentially: 30s, 1m, 2m … capped at 1h, giving up after MAX_ATTEMPTS.
 */
export async function drainOutbox() {
  return tx(async m => {
    const due = await m.getRepository(EmailOutboxEntity).createQueryBuilder('e')
      .where('e.sent_at IS NULL AND e.attempts < :max AND e.next_attempt_at <= now()', { max: MAX_ATTEMPTS })
      .orderBy('e.id')
      .limit(BATCH)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany()
    for (const e of due) {
      try {
        const id = await sendEmail({ to: e.to_email, ...render(e.template, e.data) })
        await m.update(EmailOutboxEntity, { id: e.id }, { sent_at: new Date(), provider_message_id: id, attempts: e.attempts + 1, last_error: null })
      } catch (err: any) {
        const delay = Math.min(30_000 * 2 ** e.attempts, 3_600_000)
        await m.update(EmailOutboxEntity, { id: e.id }, {
          attempts: e.attempts + 1, last_error: String(err.message).slice(0, 500), next_attempt_at: new Date(Date.now() + delay),
        })
        console.error(`email ${e.id} (${e.template} → ${e.to_email}) failed, attempt ${e.attempts + 1}:`, err.message)
      }
    }
    return due.length
  })
}
