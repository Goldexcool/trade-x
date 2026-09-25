// Seeds the admin account (from ADMIN_EMAIL / ADMIN_PASSWORD) and a test catalog.
// Idempotent: products are matched by name, so re-running adds nothing new.
// Run: docker compose exec api npm run seed
import { seedAdmin } from '../modules/auth/auth.service.ts'
import { ProductEntity, type Product } from '../modules/products/product.entity.ts'
import { config } from '../config/env.ts'
import { connect, db } from './data-source.ts'
import { redis } from './redis.ts'

type Seed = Pick<Product, 'name' | 'description' | 'category' | 'price_kobo' | 'stock'> & { is_active?: boolean }

const products: Seed[] = [
  { name: 'Classic White Sneakers', category: 'shoes', price_kobo: 2_500_000, stock: 25, description: 'Everyday leather sneakers.' },
  { name: 'Running Shoes Pro', category: 'shoes', price_kobo: 4_200_000, stock: 10, description: 'Lightweight trainers for road running.' },
  { name: 'Ankara Print Shirt', category: 'clothing', price_kobo: 1_500_000, stock: 40, description: 'Short-sleeve cotton shirt.' },
  { name: 'Denim Jacket', category: 'clothing', price_kobo: 3_800_000, stock: 12, description: 'Washed blue denim, unisex fit.' },
  { name: 'Wireless Earbuds', category: 'electronics', price_kobo: 1_850_000, stock: 30, description: 'Bluetooth 5.3, 24h battery with case.' },
  { name: 'Power Bank 20000mAh', category: 'electronics', price_kobo: 2_200_000, stock: 18, description: 'Fast charging, USB-C in/out.' },
  { name: 'Smart Watch Lite', category: 'electronics', price_kobo: 5_500_000, stock: 8, description: 'Heart rate, sleep and step tracking.' },
  { name: 'Leather Wallet', category: 'accessories', price_kobo: 800_000, stock: 50, description: 'Slim bifold wallet.' },
  { name: 'Canvas Backpack', category: 'accessories', price_kobo: 2_700_000, stock: 15, description: 'Fits a 15" laptop.' },
  { name: 'Test Item ₦100', category: 'test', price_kobo: 10_000, stock: 100, description: 'Cheap item for payment testing.' },
  // Scenario fixtures
  { name: 'Limited Edition Cap (last 2)', category: 'test', price_kobo: 500_000, stock: 2, description: 'Only 2 left: use to test concurrent checkout (Scenario A).' },
  { name: 'Sold Out Hoodie', category: 'test', price_kobo: 3_000_000, stock: 0, description: 'Out of stock: cart and checkout should refuse it.' },
  { name: 'Discontinued Mug', category: 'test', price_kobo: 400_000, stock: 5, is_active: false, description: 'Inactive: hidden from customers, visible to admin.' },
]

await connect({ migrate: true })
await seedAdmin()

const repo = db.getRepository(ProductEntity)
const existing = new Set((await repo.find({ select: { name: true } })).map(p => p.name))
const fresh = products.filter(p => !existing.has(p.name))
if (fresh.length) await repo.save(fresh)
await redis.incr('catalog:ver') // invalidate the cached catalog

console.log(`admin: ${config.adminEmail ?? '(ADMIN_EMAIL not set, skipped)'}`)
console.log(`products: ${fresh.length} added, ${products.length - fresh.length} already present`)
await db.destroy()
redis.disconnect()
