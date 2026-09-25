// Sign-up codes + email outbox. Runs against a throwaway local Postgres + Redis (BREVO_API_KEY empty → no real sends).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { connect, db, tx } from '../src/database/data-source.ts'
import { redis } from '../src/database/redis.ts'
import { login, register, verifyEmail } from '../src/modules/auth/auth.service.ts'
import { checkSignupCode, issueSignupCode, OTP_MAX_ATTEMPTS } from '../src/modules/auth/otp.service.ts'
import { drainOutbox } from '../src/modules/email/email.service.ts'
import { render } from '../src/modules/email/templates/index.ts'
import { placeOrder } from '../src/modules/orders/orders.service.ts'
import { settle } from '../src/modules/orders/settlement.service.ts'
import { handlePaystackEvent } from '../src/modules/payments/payments.service.ts'

before(() => connect({ migrate: true }))
after(async () => { await db.destroy(); redis.disconnect() })

const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params))[0]
const newEmail = () => `${randomUUID()}@test.local`
const outbox = (key: string) => db.query('SELECT template, to_email, sent_at FROM email_outbox WHERE dedupe_key = $1', [key])

test('OTP: wrong code rejected, right code works once, then it is gone', async () => {
  const email = newEmail()
  const code = await issueSignupCode(email)
  const wrong = code === '000000' ? '111111' : '000000'
  assert.equal(await checkSignupCode(email, wrong), 'invalid')
  assert.equal(await checkSignupCode(email, code), 'ok')
  assert.equal(await checkSignupCode(email, code), 'expired', 'single use')
})

test('OTP: too many wrong attempts burns the code, even the right one', async () => {
  const email = newEmail()
  const code = await issueSignupCode(email)
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) assert.equal(await checkSignupCode(email, wrong), 'invalid')
  assert.equal(await checkSignupCode(email, wrong), 'locked')
  assert.equal(await checkSignupCode(email, code), 'expired')
})

test('sign-up: login blocked until verified; verifying queues exactly one welcome email', async () => {
  const email = newEmail()
  await register(email, 'password123')
  await assert.rejects(login(email, 'password123'), (e: any) => e.status === 403)

  const code = await issueSignupCode(email) // what the email would have contained
  const { user, token } = await verifyEmail(email, code)
  assert.ok(token)
  assert.equal((await login(email, 'password123')).user.id, user.id)
  await assert.rejects(register(email, 'another-pass'), (e: any) => e.status === 409)

  const rows = await outbox(`welcome:${user.id}`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].template, 'welcome')
})

async function paidReadyOrder() {
  const { id: userId } = await one(`INSERT INTO users (email, password_hash, email_verified_at) VALUES ($1, 'x', now()) RETURNING id`, [newEmail()])
  const { id: productId } = await one(`INSERT INTO products (name, price_kobo, stock) VALUES ('Mail test item', 250000, 5) RETURNING id`)
  await db.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, 2)', [userId, productId])
  return placeOrder(userId)
}

test('outbox: duplicate webhooks queue one receipt, and the worker sends it once', async () => {
  const order = await paidReadyOrder()
  const evt = { event: 'charge.success', data: { id: Date.now(), reference: order.reference, amount: order.total_kobo } }
  await Promise.all([1, 2, 3].map(() => handlePaystackEvent(evt)))
  await tx(m => settle(m, order.reference, 'success', order.total_kobo)) // reconciler seeing it too

  const rows = await outbox(`order-paid:${order.id}`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].template, 'order_paid')

  await drainOutbox()
  const [sent] = await outbox(`order-paid:${order.id}`)
  assert.ok(sent.sent_at, 'marked sent')
})

test('outbox: an expired reservation queues one "not charged" email', async () => {
  const order = await paidReadyOrder()
  await db.query(`UPDATE orders SET expires_at = now() - interval '1 second' WHERE id = $1`, [order.id])
  await tx(m => settle(m, order.reference, 'abandoned', 0))
  await tx(m => settle(m, order.reference, 'abandoned', 0))
  const rows = await outbox(`order-released:${order.id}`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].template, 'payment_failed')
})

test('templates: money, escaping and plain text', () => {
  const m = render('order_paid', {
    email: 'a@b.c', orderId: randomUUID(), reference: 'ord-x', paidAt: new Date().toISOString(),
    totalKobo: 6_312_550, items: [{ name: '<script>x</script>', unit_price_kobo: 6_312_550, quantity: 1 }],
  })
  assert.match(m.subject, /₦63,125\.50/)
  assert.ok(!m.html.includes('<script>x'), 'product names are escaped')
  assert.match(m.text, /Total paid: ₦63,125\.50/)
})
