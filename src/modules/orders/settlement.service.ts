import type { EntityManager } from 'typeorm'
import { UserEntity } from '../auth/user.entity.ts'
import { enqueue } from '../email/email.service.ts'
import { returnStock, takeStock } from './inventory.service.ts'
import { OrderItemEntity } from './order-item.entity.ts'
import { OrderEntity, type Order, type OrderStatus } from './order.entity.ts'

/** Queue the customer email for a transition, in the same transaction (see email_outbox). */
async function notify(m: EntityManager, o: Order, status: OrderStatus) {
  if (status !== 'paid' && status !== 'failed' && status !== 'expired') return // refund_required is handled by an admin
  const { email } = await m.findOneByOrFail(UserEntity, { id: o.user_id })
  const items = (await m.findBy(OrderItemEntity, { order_id: o.id }))
    .map(({ name, unit_price_kobo, quantity }) => ({ name, unit_price_kobo, quantity }))
  const base = { email, orderId: o.id, reference: o.reference, totalKobo: o.total_kobo, items }
  const now = new Date().toISOString()
  if (status === 'paid') await enqueue(m, 'order_paid', email, { ...base, paidAt: now }, `order-paid:${o.id}`)
  else await enqueue(m, 'payment_failed', email, { ...base, reason: status, at: now }, `order-released:${o.id}`)
}

/**
 * The single place an order leaves 'pending'. Webhook, callback and reconciler all call it with
 * Paystack's view of the transaction. Row lock + status guard make it safe to call any number of
 * times, concurrently. Must run inside a transaction. (Scenarios D, E, F)
 */
export async function settle(m: EntityManager, reference: string, gatewayStatus: string, amount: number): Promise<OrderStatus | null> {
  const o = await m.getRepository(OrderEntity).createQueryBuilder('o')
    .where('o.reference = :reference', { reference })
    .setLock('pessimistic_write')
    .getOne()
  if (!o) return null
  const set = async (status: OrderStatus, paid = false) => {
    await m.update(OrderEntity, { id: o.id }, paid ? { status, paid_at: new Date() } : { status })
    await notify(m, o, status)
    return status
  }

  if (gatewayStatus === 'success') {
    if (o.status === 'paid' || o.status === 'refund_required') return o.status
    if (amount !== o.total_kobo) {
      if (o.status === 'pending') await returnStock(m, o.id)
      return set('refund_required', true)
    }
    if (o.status === 'pending') return set('paid', true)
    // Paid after the reservation was released: take stock again if it's still there.
    return set((await takeStock(m, o.id)) ? 'paid' : 'refund_required', true)
  }

  if (o.status !== 'pending') return o.status
  const failed = gatewayStatus === 'failed' || gatewayStatus === 'reversed'
  if (!failed && o.expires_at > new Date()) return 'pending' // 'abandoned'/'ongoing' before expiry = customer may still pay
  await returnStock(m, o.id)
  return set(failed ? 'failed' : 'expired')
}
