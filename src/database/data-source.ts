import 'reflect-metadata'
import { DataSource, type EntityManager } from 'typeorm'
import { config } from '../config/env.ts'
import { UserEntity } from '../modules/auth/user.entity.ts'
import { EmailOutboxEntity } from '../modules/email/email-outbox.entity.ts'
import { CartItemEntity } from '../modules/cart/cart-item.entity.ts'
import { OrderItemEntity } from '../modules/orders/order-item.entity.ts'
import { OrderEntity } from '../modules/orders/order.entity.ts'
import { WebhookEventEntity } from '../modules/payments/webhook-event.entity.ts'
import { ProductEntity } from '../modules/products/product.entity.ts'
import { Init1727000000000 } from './migrations/1727000000000-init.ts'
import { Email1727100000000 } from './migrations/1727100000000-email.ts'

export const db = new DataSource({
  type: 'postgres',
  url: config.databaseUrl,
  entities: [UserEntity, ProductEntity, CartItemEntity, OrderEntity, OrderItemEntity, WebhookEventEntity, EmailOutboxEntity],
  migrations: [Init1727000000000, Email1727100000000],
  synchronize: false,
  extra: { max: 10 },
})

export const tx = <T>(fn: (m: EntityManager) => Promise<T>) => db.transaction(fn)

export async function connect({ migrate = false } = {}) {
  if (!db.isInitialized) await db.initialize()
  if (migrate) await withMigrationLock(() => db.runMigrations({ transaction: 'each' }))
}

// Several processes may boot at once (api replicas, parallel test files). A transaction-scoped
// advisory lock serialises them; session locks aren't reliable behind Neon's PgBouncer pooler.
async function withMigrationLock(run: () => Promise<unknown>) {
  const qr = db.createQueryRunner()
  await qr.connect()
  await qr.startTransaction()
  try {
    await qr.query('SELECT pg_advisory_xact_lock(7331)')
    await run()
    await qr.commitTransaction()
  } catch (err) {
    await qr.rollbackTransaction()
    throw err
  } finally {
    await qr.release()
  }
}
