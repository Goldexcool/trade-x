import { EntitySchema } from 'typeorm'

export type Product = {
  id: string; name: string; description: string; category: string | null
  price_kobo: number; stock: number; is_active: boolean; created_at: Date; updated_at: Date
}

export const ProductEntity = new EntitySchema<Product>({
  name: 'Product', tableName: 'products',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    name: { type: 'text' },
    description: { type: 'text', default: '' },
    category: { type: 'text', nullable: true },
    price_kobo: { type: 'integer' },
    stock: { type: 'integer' }, // units available to sell; pending orders already deducted
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'timestamptz', createDate: true },
    updated_at: { type: 'timestamptz', updateDate: true },
  },
})
