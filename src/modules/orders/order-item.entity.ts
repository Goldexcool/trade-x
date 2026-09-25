import { EntitySchema } from 'typeorm'
import type { Product } from '../products/product.entity.ts'

// Snapshot of what was bought, at the price charged.
export type OrderItem = { order_id: string; product_id: string; name: string; unit_price_kobo: number; quantity: number; product?: Product }

export const OrderItemEntity = new EntitySchema<OrderItem>({
  name: 'OrderItem', tableName: 'order_items',
  columns: {
    order_id: { type: 'uuid', primary: true },
    product_id: { type: 'uuid', primary: true },
    name: { type: 'text' },
    unit_price_kobo: { type: 'integer' },
    quantity: { type: 'integer' },
  },
  relations: { product: { type: 'many-to-one', target: 'Product', joinColumn: { name: 'product_id' } } },
})
