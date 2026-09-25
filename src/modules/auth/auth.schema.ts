import { z } from 'zod'

const email = z.email().transform(s => s.toLowerCase())

export const registerBody = z.object({ email, password: z.string().min(8).max(72) })
export const loginBody = z.object({ email, password: z.string().max(72) })
export const verifyBody = z.object({ email, code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') })
export const resendBody = z.object({ email })
