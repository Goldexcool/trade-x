import express, { Router } from 'express'
import { HttpError } from '../../shared/errors.ts'
import { validSignature } from './paystack.client.ts'
import { callbackQuery } from './payments.schema.ts'
import * as payments from './payments.service.ts'

export const paymentsRouter = Router()

// Raw body is required for the signature check, so this router is mounted before express.json().
paymentsRouter.post('/webhooks/paystack', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!validSignature(req.body, req.get('x-paystack-signature'))) throw new HttpError(401, 'Invalid signature')
  const result = await payments.handlePaystackEvent(JSON.parse(req.body.toString('utf8')))
  res.json({ received: true, result })
})

// Paystack redirects the browser here after payment.
paymentsRouter.get('/payments/callback', async (req, res) => {
  const { reference } = callbackQuery.parse(req.query)
  res.json(await payments.verifyAndSettle(reference))
})
