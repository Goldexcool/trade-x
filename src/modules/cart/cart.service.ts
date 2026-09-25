import { db } from '../../database/data-source.ts'
import { HttpError } from '../../shared/errors.ts'
import { ProductEntity } from '../products/product.entity.ts'
import { CartItemEntity } from './cart-item.entity.ts'

// Every function is scoped by the caller's userId (from the JWT); there is no cart id to tamper with.
const cart = () => db.getRepository(CartItemEntity)

export async function getCart(userId: string) {
  const rows = await cart().find({ where: { user_id: userId }, relations: { product: true }, order: { added_at: 'ASC' } })
  const items = rows.map(({ product: p, quantity }) => ({
    product_id: p!.id,
    name: p!.name,
    price_kobo: p!.price_kobo, // always the live price (Scenario B)
    quantity,
    subtotal_kobo: p!.price_kobo * quantity,
    available: p!.is_active && p!.stock >= quantity,
    in_stock: p!.is_active ? p!.stock : 0,
  }))
  return {
    items,
    total_kobo: items.reduce((s, i) => s + i.subtotal_kobo, 0),
    checkout_ready: items.length > 0 && items.every(i => i.available),
  }
}

export async function setItem(userId: string, productId: string, quantity: number) {
  const p = await db.getRepository(ProductEntity).findOneBy({ id: productId })
  if (!p?.is_active) throw new HttpError(404, 'Product not found')
  if (quantity > p.stock) throw new HttpError(409, 'Not enough stock', { available: p.stock })
  await cart().upsert({ user_id: userId, product_id: p.id, quantity }, ['user_id', 'product_id'])
}

export async function removeItem(userId: string, productId: string) {
  await cart().delete({ user_id: userId, product_id: productId })
}
