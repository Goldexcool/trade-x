import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../../config/env.ts'
import { db, tx } from '../../database/data-source.ts'
import { HttpError } from '../../shared/errors.ts'
import type { AuthUser } from '../../shared/middleware/auth.middleware.ts'
import { enqueue, sendNow } from '../email/email.service.ts'
import { checkSignupCode, claimResendSlot, issueSignupCode, OTP_TTL_SEC } from './otp.service.ts'
import { UserEntity } from './user.entity.ts'

const users = () => db.getRepository(UserEntity)
const publicUser = (u: AuthUser): AuthUser => ({ id: u.id, email: u.email, role: u.role })
const sign = (u: AuthUser) => jwt.sign({ email: u.email, role: u.role }, config.jwtSecret, { subject: u.id, expiresIn: '1h' })
const session = (u: AuthUser) => ({ user: publicUser(u), token: sign(u) })

async function sendSignupCode(email: string) {
  const code = await issueSignupCode(email)
  await sendNow('signup_code', email, { email, code, expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString() })
    .catch(err => {
      console.error(`sign-up code email to ${email} failed:`, err.message)
      throw new HttpError(502, `We couldn't send your code. Try "resend code" in a minute.`)
    })
}

/**
 * Step 1 of sign-up: create (or refresh) an unverified account and email a 6-digit code.
 * No token yet: the account can't be used until the code is confirmed.
 */
export async function register(email: string, password: string) {
  const existing = await users().findOneBy({ email })
  if (existing?.email_verified_at) throw new HttpError(409, 'Email already registered')
  const password_hash = await bcrypt.hash(password, 10)
  // Unverified row = abandoned sign-up; whoever proves the inbox with the code owns it.
  if (existing) await users().update({ id: existing.id }, { password_hash })
  else await users().save({ email, password_hash, role: 'customer', email_verified_at: null })
  await claimResendSlot(email) // starts the resend cooldown
  await sendSignupCode(email)
  return { email, message: 'We sent a 6-digit code to your email. It expires in 10 minutes.' }
}

/** Step 2: confirm the code → account verified, welcome email queued, session issued. */
export async function verifyEmail(email: string, code: string) {
  const user = await users().findOneBy({ email })
  if (!user) throw new HttpError(400, 'That code is wrong or has expired.')
  if (user.email_verified_at) throw new HttpError(409, 'This email is already verified. Sign in instead.')

  const result = await checkSignupCode(email, code)
  if (result === 'expired') throw new HttpError(400, 'That code has expired. Request a new one.')
  if (result === 'locked') throw new HttpError(429, 'Too many wrong attempts. Request a new code.')
  if (result === 'invalid') throw new HttpError(400, 'That code is wrong or has expired.')

  await tx(async m => {
    await m.update(UserEntity, { id: user.id }, { email_verified_at: new Date() })
    await enqueue(m, 'welcome', email, { email }, `welcome:${user.id}`)
  })
  return session(user)
}

/** Always answers the same way, so it can't be used to probe which emails have accounts. */
export async function resendCode(email: string) {
  const user = await users().findOneBy({ email })
  if (user && !user.email_verified_at && (await claimResendSlot(email))) await sendSignupCode(email)
  return { message: 'If that email is waiting for verification, a new code is on its way.' }
}

export async function login(email: string, password: string) {
  const user = await users().findOneBy({ email })
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid email or password')
  if (!user.email_verified_at) throw new HttpError(403, 'Verify your email first. We sent you a 6-digit code.', { code: 'EMAIL_NOT_VERIFIED' })
  return session(user)
}

export async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return
  await users().createQueryBuilder().insert()
    .values({ email: config.adminEmail.toLowerCase(), password_hash: await bcrypt.hash(config.adminPassword, 10), role: 'admin', email_verified_at: new Date() })
    .orUpdate(['role'], ['email'])
    .execute()
}
