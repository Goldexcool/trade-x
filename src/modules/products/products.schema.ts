import { z } from 'zod'

export const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  category: z.string().trim().max(100).nullable().default(null),
  price_kobo: z.number().int().positive(),
  stock: z.number().int().min(0),
  is_active: z.boolean().default(true),
})
export const productPatch = productBody.partial()

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(100).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeInactive: z.enum(['true', 'false']).optional(),
})

export type ProductInput = z.infer<typeof productBody>
export type ProductPatch = z.infer<typeof productPatch>
export type ProductFilters = Omit<z.infer<typeof listQuery>, 'includeInactive'>
