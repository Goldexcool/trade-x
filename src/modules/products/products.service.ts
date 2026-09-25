import { db } from '../../database/data-source.ts'
import { redis } from '../../database/redis.ts'
import { HttpError } from '../../shared/errors.ts'
import { ProductEntity, type Product } from './product.entity.ts'
import type { ProductFilters, ProductInput, ProductPatch } from './products.schema.ts'

const products = () => db.getRepository(ProductEntity)
const view = (p: Product) => ({ ...p, in_stock: p.stock > 0 })
const SORT = {
  newest: ['p.created_at', 'DESC'],
  price_asc: ['p.price_kobo', 'ASC'],
  price_desc: ['p.price_kobo', 'DESC'],
} as const

// Catalog list cache: every admin write bumps the version, orphaning old keys.
// ponytail: stock/in_stock can lag checkout by up to CACHE_TTL; checkout re-validates, so it's display-only staleness.
const CACHE_TTL = 30
const bumpCatalog = () => redis.incr('catalog:ver').catch(() => {})

export async function listProducts(f: ProductFilters, showInactive: boolean) {
  const cacheKey = `catalog:${await redis.get('catalog:ver').catch(() => null) ?? 0}:${showInactive}:${JSON.stringify(f)}`
  const cached = await redis.get(cacheKey).catch(() => null)
  if (cached) return JSON.parse(cached)

  const qb = products().createQueryBuilder('p')
  if (!showInactive) qb.andWhere('p.is_active = true')
  if (f.q) qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q)', { q: `%${f.q}%` })
  if (f.category) qb.andWhere('p.category = :category', { category: f.category })
  if (f.minPrice !== undefined) qb.andWhere('p.price_kobo >= :minPrice', { minPrice: f.minPrice })
  if (f.maxPrice !== undefined) qb.andWhere('p.price_kobo <= :maxPrice', { maxPrice: f.maxPrice })
  if (f.inStock === 'true') qb.andWhere('p.stock > 0')
  if (f.inStock === 'false') qb.andWhere('p.stock = 0')
  const [items, total] = await qb
    .orderBy(SORT[f.sort][0], SORT[f.sort][1]).addOrderBy('p.id')
    .limit(f.limit).offset((f.page - 1) * f.limit)
    .getManyAndCount()

  const result = { items: items.map(view), page: f.page, limit: f.limit, total }
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL).catch(() => {})
  return result
}

export async function getProduct(id: string, isAdmin: boolean) {
  const p = await products().findOneBy({ id })
  if (!p || (!p.is_active && !isAdmin)) throw new HttpError(404, 'Product not found')
  return view(p)
}

export async function createProduct(input: ProductInput) {
  const { id } = await products().save(input)
  await bumpCatalog()
  return view(await products().findOneByOrFail({ id }))
}

export async function updateProduct(id: string, patch: ProductPatch) {
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update')
  const { affected } = await products().update({ id }, patch)
  if (!affected) throw new HttpError(404, 'Product not found')
  await bumpCatalog()
  return view(await products().findOneByOrFail({ id }))
}

// Soft delete: order_items keep referencing the product, and carts see it as unavailable.
export async function deactivateProduct(id: string) {
  const { affected } = await products().update({ id }, { is_active: false })
  if (!affected) throw new HttpError(404, 'Product not found')
  await bumpCatalog()
}
