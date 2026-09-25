import { randomUUID } from 'node:crypto'
import { In } from 'typeorm'
import { config } from '../../config/env.ts'
import { db, tx } from '../../database/data-source.ts'
import { HttpError } from '../../shared/errors.ts'
import type { AuthUser } from '../../shared/middleware/auth.middleware.ts'
import { CartItemEntity } from '../cart/cart-item.entity.ts'
import * as paystack from '../payments/paystack.client.ts'
import { ProductEntity } from '../products/product.entity.ts'
import { returnStock } from './inventory.service.ts'
import { OrderItemEntity } from './order-item.entity.ts'
import { OrderEntity } from './order.entity.ts'

/**
 * One transaction: lock cart + product rows, validate, price server-side, reserve stock,
 * snapshot items, remove them from the cart. Any throw rolls all of it back. (Scenarios A, B, C, F)
 */
export async function placeOrder(userId: string, expectedTotal?: number) {
  return tx(async m => {
    // SELECT ... FOR UPDATE, product rows locked in id order.
    const lines = await m.getRepository(CartItemEntity).createQueryBuilder('ci')
      .innerJoinAndSelect('ci.product', 'p')
      .where('ci.user_id = :userId', { userId })
      .orderBy('p.id')
      .setLock('pessimistic_write')
      .getMany()
    if (!lines.length) throw new HttpError(400, 'Cart is empty')

    const problems = lines
      .filter(({ product: p, quantity }) => !p!.is_active || p!.stock < quantity)
      .map(({ product: p, quantity }) => ({ product_id: p!.id, name: p!.name, requested: quantity, available: p!.is_active ? p!.stock : 0 }))
    if (problems.length) throw new HttpError(409, 'Some items are no longer available in the requested quantity', { problems })

    const total = lines.reduce((s, l) => s + l.product!.price_kobo * l.quantity, 0)
    if (expectedTotal !== undefined && expectedTotal !== total)
      throw new HttpError(409, 'Prices changed since you last viewed your cart', {
        total_kobo: total,
        items: lines.map(({ product: p, quantity }) => ({ product_id: p!.id, name: p!.name, price_kobo: p!.price_kobo, quantity })),
      })

    const order = await m.getRepository(OrderEntity).save({
      user_id: userId,
      status: 'pending',
      total_kobo: total,
      reference: `ord-${randomUUID()}`,
      expires_at: new Date(Date.now() + config.reservationMinutes * 60_000),
    })
    await m.insert(OrderItemEntity, lines.map(({ product: p, quantity }) => ({
      order_id: order.id, product_id: p!.id, name: p!.name, unit_price_kobo: p!.price_kobo, quantity,
    })))
    for (const l of lines) await m.decrement(ProductEntity, { id: l.product_id }, 'stock', l.quantity)
    await m.delete(CartItemEntity, { user_id: userId, product_id: In(lines.map(l => l.product_id)) })
    return order
  })
}

/** Compensation when payment init fails: release stock and put the items back in the cart. Idempotent. */
export async function cancelUnpaid(orderId: string, userId: string) {
  await tx(async m => {
    const { affected } = await m.update(OrderEntity, { id: orderId, status: 'pending' }, { status: 'failed' })
    if (!affected) return
    await returnStock(m, orderId)
    const items = await m.findBy(OrderItemEntity, { order_id: orderId })
    await m.createQueryBuilder().insert().into(CartItemEntity)
      .values(items.map(i => ({ user_id: userId, product_id: i.product_id, quantity: i.quantity })))
      .orIgnore()
      .execute()
  })
}

export async function checkout(user: AuthUser, expectedTotal?: number) {
  const order = await placeOrder(user.id, expectedTotal)
  // Network call happens outside the DB transaction: never hold row locks across HTTP.
  const init = await paystack
    .initialize({ email: user.email, amount: order.total_kobo, reference: order.reference })
    .catch(async err => {
      console.error(`payment init failed for ${order.reference}:`, err.message)
      await cancelUnpaid(order.id, user.id)
      throw new HttpError(502, 'Could not start payment. Your cart has been restored and nothing was charged.')
    })
  await db.getRepository(OrderEntity).update({ id: order.id }, { authorization_url: init.authorization_url })
  return { ...order, authorization_url: init.authorization_url }
}

export function listOrders(user: AuthUser) {
  return db.getRepository(OrderEntity).find({
    where: user.role === 'admin' ? {} : { user_id: user.id },
    order: { created_at: 'DESC' },
    take: 100,
  })
}

// Someone else's order is a 404, not a 403: don't confirm it exists.
export async function getOrder(user: AuthUser, id: string) {
  const order = await db.getRepository(OrderEntity).findOneBy(user.role === 'admin' ? { id } : { id, user_id: user.id })
  if (!order) throw new HttpError(404, 'Order not found')
  const items = await db.getRepository(OrderItemEntity).findBy({ order_id: order.id })
  return { ...order, items }
}
