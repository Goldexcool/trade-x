import type { EntityManager } from 'typeorm'
import { ProductEntity } from '../products/product.entity.ts'
import { OrderItemEntity } from './order-item.entity.ts'

// Lock order: orders row first, then products rows in id order. Every path follows it, so no deadlocks.

function lockOrderStock(m: EntityManager, orderId: string) {
  return m.getRepository(OrderItemEntity).createQueryBuilder('oi')
    .innerJoinAndSelect('oi.product', 'p')
    .where('oi.order_id = :orderId', { orderId })
    .orderBy('p.id')
    .setLock('pessimistic_write')
    .getMany()
}

export async function returnStock(m: EntityManager, orderId: string) {
  for (const i of await lockOrderStock(m, orderId)) await m.increment(ProductEntity, { id: i.product_id }, 'stock', i.quantity)
}

/** Re-reserve an order's items. All-or-nothing: returns false (touching nothing) if any line is short. */
export async function takeStock(m: EntityManager, orderId: string) {
  const items = await lockOrderStock(m, orderId)
  if (items.some(i => i.product!.stock < i.quantity)) return false
  for (const i of items) await m.decrement(ProductEntity, { id: i.product_id }, 'stock', i.quantity)
  return true
}
