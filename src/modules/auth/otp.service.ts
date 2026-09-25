import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { config } from '../../config/env.ts'
import { redis } from '../../database/redis.ts'

export const OTP_TTL_SEC = 600
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_SEC = 60

const key = (email: string) => `otp:signup:${email}`
// Only a keyed hash is stored, never the code itself.
const digest = (email: string, code: string) => createHmac('sha256', config.jwtSecret).update(`${email}:${code}`).digest()

/** Issue a fresh 6-digit sign-up code. Replaces any previous code and resets the attempt counter. */
export async function issueSignupCode(email: string): Promise<string> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  await redis.multi()
    .del(key(email))
    .hset(key(email), 'hash', digest(email, code).toString('hex'), 'attempts', 0)
    .expire(key(email), OTP_TTL_SEC)
    .exec()
  return code
}

/** Resend throttle: true if the caller may send another code now. */
export async function claimResendSlot(email: string) {
  return (await redis.set(`otp:cooldown:${email}`, '1', 'EX', OTP_RESEND_COOLDOWN_SEC, 'NX')) === 'OK'
}

export type CheckResult = 'ok' | 'invalid' | 'expired' | 'locked'

/** Single-use: a correct code is deleted on success. After OTP_MAX_ATTEMPTS wrong tries the code is burned. */
export async function checkSignupCode(email: string, code: string): Promise<CheckResult> {
  const stored = await redis.hgetall(key(email))
  if (!stored.hash) return 'expired'
  if (Number(stored.attempts) >= OTP_MAX_ATTEMPTS) return 'locked'
  const ok = timingSafeEqual(Buffer.from(stored.hash, 'hex'), digest(email, code))
  if (ok) {
    await redis.del(key(email))
    return 'ok'
  }
  const attempts = await redis.hincrby(key(email), 'attempts', 1)
  if (attempts >= OTP_MAX_ATTEMPTS) await redis.del(key(email))
  return attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid'
}
