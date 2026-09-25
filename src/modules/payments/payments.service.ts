import { LessThan } from 'typeorm'
import { db, tx } from '../../database/data-source.ts'
import { redis } from '../../database/redis.ts'
import { HttpError } from '../../shared/errors.ts'
import { OrderEntity } from '../orders/order.entity.ts'
import { settle } from '../orders/settlement.service.ts'
import * as paystack from './paystack.client.ts'
import { WebhookEventEntity } from './webhook-event.entity.ts'

/**
 * Dedupe row and state change commit together, so an event's effect happens exactly once:
 * a concurrent duplicate blocks on the PK until we commit, then inserts nothing. (Scenario E)
 */
export async function handlePaystackEvent(evt: any) {
  const reference: string | undefined = evt?.data?.reference
  const key = `${evt?.event}:${evt?.data?.id ?? reference}`
  return tx(async m => {
    const inserted = await m.createQueryBuilder().insert().into(WebhookEventEntity)
      .values({ event_key: key, event: evt?.event ?? 'unknown', reference: reference ?? null, payload: evt })
      .orIgnore()
      .returning('event_key')
      .execute()
    if (!inserted.raw.length) return 'duplicate'
    if (evt.event === 'charge.success' && reference) return (await settle(m, reference, 'success', evt.data.amount)) ?? 'unknown_order'
    return 'ignored'
  })
}

/** Browser came back from Paystack. Don't trust the redirect; ask Paystack. (Scenario D) */
export async function verifyAndSettle(reference: string) {
  const tr = await paystack.verify(reference).catch(() => { throw new HttpError(502, 'Could not verify payment, try again shortly') })
  const status = await tx(m => settle(m, reference, tr.status, tr.amount))
  if (!status) throw new HttpError(404, 'Order not found')
  return { reference, status }
}

/**
 * Background reconciliation for orders whose webhook never arrived (closed tab, webhook down):
 * ask Paystack, then settle. Unpaid past expiry → stock released. (Scenarios D, F)
 */
export async function reconcilePending() {
  // Only one worker replica runs a pass at a time.
  if ((await redis.set('lock:reconciler', String(process.pid), 'EX', 50, 'NX')) !== 'OK') return
  const pending = await db.getRepository(OrderEntity).find({
    select: { reference: true },
    where: { status: 'pending', created_at: LessThan(new Date(Date.now() - 60_000)) },
    order: { created_at: 'ASC' },
    take: 200,
  })
  for (const { reference } of pending) {
    // Gateway unreachable → treat as not paid. Past expiry that releases stock; a later
    // charge.success webhook still settles via settle()'s late-payment path.
    const tr = await paystack.verify(reference).catch(() => null)
    const status = await tx(m => settle(m, reference, tr?.status ?? 'unknown', tr?.amount ?? 0))
      .catch(err => console.error(`reconcile ${reference} failed:`, err.message))
    if (status && status !== 'pending') console.log(`reconciled ${reference} -> ${status}`)
  }
}
