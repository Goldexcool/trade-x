import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../../config/env.ts'

type Transaction = { status: string; amount: number; reference: string }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.status) throw new Error(`Paystack ${path} failed (${res.status}): ${body.message ?? 'no body'}`)
  return body.data
}

export const initialize = (p: { email: string; amount: number; reference: string }) =>
  call<{ authorization_url: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ ...p, currency: 'NGN', callback_url: config.paystackCallbackUrl }),
  })

export const verify = (reference: string) => call<Transaction>(`/transaction/verify/${encodeURIComponent(reference)}`)

// Paystack signs the raw body with HMAC-SHA512 using the secret key.
export function validSignature(raw: unknown, signature: string | undefined) {
  if (!Buffer.isBuffer(raw) || !signature) return false
  const expected = Buffer.from(createHmac('sha512', config.paystackSecret).update(raw).digest('hex'))
  const given = Buffer.from(signature)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
