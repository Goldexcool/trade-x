// Renders every template with sample data to .email-previews/ for visual review.
// Run: npm run email:preview   (no DB/Redis needed)
import { mkdirSync, writeFileSync } from 'node:fs'
import { render } from './templates/index.ts'

const out = new URL('../../../.email-previews/', import.meta.url)
mkdirSync(out, { recursive: true })

const email = 'adaeze.okafor@gmail.com'
const orderId = '7f3a21c4-9b2e-4d1a-8c55-0e6b2a9d4f10'
const reference = `ord-${orderId}`
const items = [
  { name: 'Classic White Sneakers', unit_price_kobo: 2_500_000, quantity: 1 },
  { name: 'Ankara Print Shirt', unit_price_kobo: 1_500_000, quantity: 2 },
  { name: 'Leather Wallet', unit_price_kobo: 812_550, quantity: 1 },
]
const totalKobo = items.reduce((s, i) => s + i.unit_price_kobo * i.quantity, 0)
const at = '2026-09-25T14:32:00Z'

const samples = {
  'signup-code': render('signup_code', { email, code: '482913', expiresAt: '2026-09-25T14:42:00Z' }),
  welcome: render('welcome', { email }),
  'order-paid': render('order_paid', { email, orderId, reference, paidAt: at, totalKobo, items }),
  'payment-failed': render('payment_failed', { email, orderId, reference, reason: 'failed', at, totalKobo, items }),
  'reservation-expired': render('payment_failed', { email, orderId, reference, reason: 'expired', at, totalKobo, items: items.slice(0, 1) }),
}

for (const [name, m] of Object.entries(samples)) {
  writeFileSync(new URL(`${name}.html`, out), m.html)
  writeFileSync(new URL(`${name}.txt`, out), `Subject: ${m.subject}\n\n${m.text}`)
  console.log(`${name}: ${m.subject}  (${(m.html.length / 1024).toFixed(1)} KB)`)
}
