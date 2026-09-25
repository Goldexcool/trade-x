import { EntitySchema } from 'typeorm'

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refund_required'
export type Order = {
  id: string; user_id: string; status: OrderStatus; total_kobo: number; reference: string
  authorization_url: string | null; expires_at: Date; paid_at: Date | null; created_at: Date
}

export const OrderEntity = new EntitySchema<Order>({
  name: 'Order', tableName: 'orders',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    user_id: { type: 'uuid' },
    status: { type: 'text' },
    total_kobo: { type: 'integer' },
    reference: { type: 'text', unique: true },
    authorization_url: { type: 'text', nullable: true },
    expires_at: { type: 'timestamptz' },
    paid_at: { type: 'timestamptz', nullable: true },
    created_at: { type: 'timestamptz', createDate: true },
  },
})
