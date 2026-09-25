import { Router } from 'express'
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.ts'
import { loginBody, registerBody, resendBody, verifyBody } from './auth.schema.ts'
import * as auth from './auth.service.ts'

export const authRouter = Router()

authRouter.post('/auth/register', rateLimit(10, 60), async (req, res) => {
  const { email, password } = registerBody.parse(req.body)
  res.status(202).json(await auth.register(email, password))
})

authRouter.post('/auth/verify-email', rateLimit(10, 60), async (req, res) => {
  const { email, code } = verifyBody.parse(req.body)
  res.json(await auth.verifyEmail(email, code))
})

authRouter.post('/auth/resend-code', rateLimit(5, 60), async (req, res) => {
  const { email } = resendBody.parse(req.body)
  res.status(202).json(await auth.resendCode(email))
})

authRouter.post('/auth/login', rateLimit(10, 60), async (req, res) => {
  const { email, password } = loginBody.parse(req.body)
  res.json(await auth.login(email, password))
})
