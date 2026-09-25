import { EntitySchema } from 'typeorm'
import type { Product } from '../products/product.entity.ts'

// No price column: carts always read the live price (Scenario B).
export type CartItem = { user_id: string; product_id: string; quantity: number; added_at: Date; product?: Product }

export const CartItemEntity = new EntitySchema<CartItem>({
  name: 'CartItem', tableName: 'cart_items',
  columns: {
    user_id: { type: 'uuid', primary: true },
    product_id: { type: 'uuid', primary: true },
    quantity: { type: 'integer' },
    added_at: { type: 'timestamptz', createDate: true },
  },
  relations: { product: { type: 'many-to-one', target: 'Product', joinColumn: { name: 'product_id' } } },
})
