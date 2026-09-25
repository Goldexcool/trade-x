// Runs against a throwaway local Postgres + Redis: docker compose --profile test run --rm test
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { connect, db, tx } from '../src/database/data-source.ts'
import { redis } from '../src/database/redis.ts'
import { cancelUnpaid, placeOrder } from '../src/modules/orders/orders.service.ts'
import { settle } from '../src/modules/orders/settlement.service.ts'
import { handlePaystackEvent } from '../src/modules/payments/payments.service.ts'

before(() => connect({ migrate: true }))
after(async () => { await db.destroy(); redis.disconnect() })

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params))[0]
const newUser = async (): Promise<string> =>
  (await one(`INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`, [`${randomUUID()}@test.local`])).id
const newProduct = async (stock: number, price = 1000): Promise<string> =>
  (await one(`INSERT INTO products (name, price_kobo, stock) VALUES ('Test item', $1, $2) RETURNING id`, [price, stock])).id
const addToCart = (u: string, p: string, qty: number) =>
  db.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)', [u, p, qty])
const stockOf = async (p: string) => (await one('SELECT stock FROM products WHERE id = $1', [p])).stock
const statusOf = async (ref: string) => (await one('SELECT status FROM orders WHERE reference = $1', [ref])).status

test('A: 5 buyers racing for the last 2 units -> exactly 2 orders, stock 0', async () => {
  const p = await newProduct(2)
  const buyers = await Promise.all(Array.from({ length: 5 }, newUser))
  for (const b of buyers) await addToCart(b, p, 1)

  const results = await Promise.allSettled(buyers.map(b => placeOrder(b)))

  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2)
  for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.status, 409)
  assert.equal(await stockOf(p), 0)
})

test('B: price change while in cart -> stale expectedTotal rejected, order snapshots new price', async () => {
  const u = await newUser()
  const p = await newProduct(5, 1000)
  await addToCart(u, p, 2)
  await db.query('UPDATE products SET price_kobo = 1500 WHERE id = $1', [p])

  await assert.rejects(placeOrder(u, 2000), (e: any) => e.status === 409 && e.details.total_kobo === 3000)
  assert.equal(await stockOf(p), 5, 'rejected checkout reserved nothing')

  const order = await placeOrder(u, 3000)
  await db.query('UPDATE products SET price_kobo = 9999 WHERE id = $1', [p])
  const item = await one('SELECT unit_price_kobo FROM order_items WHERE order_id = $1', [order.id])
  assert.equal(item.unit_price_kobo, 1500, 'order keeps the price it was placed at')
})

test('C: failure mid-checkout rolls back everything; payment-init compensation is idempotent', async () => {
  const u = await newUser()
  const ok = await newProduct(5)
  const gone = await newProduct(5)
  await addToCart(u, ok, 1)
  await addToCart(u, gone, 1)
  await db.query('UPDATE products SET is_active = false WHERE id = $1', [gone])

  await assert.rejects(placeOrder(u), (e: any) => e.status === 409)
  assert.equal(await stockOf(ok), 5)
  assert.equal((await one('SELECT count(*)::int AS n FROM cart_items WHERE user_id = $1', [u])).n, 2)
  assert.equal((await one('SELECT count(*)::int AS n FROM orders WHERE user_id = $1', [u])).n, 0)

  // Payment init failed after the order committed -> compensate.
  await db.query('DELETE FROM cart_items WHERE product_id = $1', [gone])
  const order = await placeOrder(u)
  assert.equal(await stockOf(ok), 4)
  await cancelUnpaid(order.id, u)
  await cancelUnpaid(order.id, u)
  assert.equal(await stockOf(ok), 5, 'stock returned exactly once')
  assert.equal(await statusOf(order.reference), 'failed')
  assert.equal((await one('SELECT quantity FROM cart_items WHERE user_id = $1 AND product_id = $2', [u, ok])).quantity, 1)
})

test('D: abandoned payment stays reserved until expiry, then reconciler releases it', async () => {
  const u = await newUser()
  const p = await newProduct(3)
  await addToCart(u, p, 2)
  const order = await placeOrder(u)

  assert.equal(await tx(m => settle(m, order.reference, 'abandoned', 0)), 'pending')
  assert.equal(await stockOf(p), 1)

  await db.query(`UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1`, [order.id])
  assert.equal(await tx(m => settle(m, order.reference, 'abandoned', 0)), 'expired')
  assert.equal(await stockOf(p), 3)
})

test('E: the same webhook delivered 3x concurrently is applied once', async () => {
  const u = await newUser()
  const p = await newProduct(3)
  await addToCart(u, p, 1)
  const order = await placeOrder(u)
  const evt = { event: 'charge.success', data: { id: Date.now(), reference: order.reference, amount: order.total_kobo } }

  const results = await Promise.all([1, 2, 3].map(() => handlePaystackEvent(evt)))

  assert.deepEqual(results.sort(), ['duplicate', 'duplicate', 'paid'])
  assert.equal(await statusOf(order.reference), 'paid')
  assert.equal(await stockOf(p), 2, 'stock moved once, at checkout')
  assert.equal((await one('SELECT count(*)::int AS n FROM webhook_events WHERE reference = $1', [order.reference])).n, 1)
  // Reconciler seeing it afterwards is a no-op too.
  assert.equal(await tx(m => settle(m, order.reference, 'success', order.total_kobo)), 'paid')
})

test('F: failed payment releases stock; a late success re-reserves, or flags a refund if sold out', async () => {
  const p = await newProduct(1)
  const u1 = await newUser()
  await addToCart(u1, p, 1)
  const o1 = await placeOrder(u1)
  assert.equal(await stockOf(p), 0)

  assert.equal(await tx(m => settle(m, o1.reference, 'failed', 0)), 'failed')
  assert.equal(await stockOf(p), 1)

  // Late success while stock is still there -> paid, stock taken again.
  assert.equal(await tx(m => settle(m, o1.reference, 'success', o1.total_kobo)), 'paid')
  assert.equal(await stockOf(p), 0)

  // Late success after someone else bought the unit -> never oversell, flag for refund.
  const q = await newProduct(1)
  const u2 = await newUser(), u3 = await newUser()
  await addToCart(u2, q, 1)
  const o2 = await placeOrder(u2)
  await tx(m => settle(m, o2.reference, 'failed', 0))
  await addToCart(u3, q, 1)
  await placeOrder(u3)
  assert.equal(await tx(m => settle(m, o2.reference, 'success', o2.total_kobo)), 'refund_required')
  assert.equal(await stockOf(q), 0)
})
