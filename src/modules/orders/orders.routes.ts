import { Router } from 'express'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { uuidParam } from '../../shared/validation.ts'
import { checkoutBody } from './orders.schema.ts'
import * as orders from './orders.service.ts'

export const ordersRouter = Router()

ordersRouter.post('/checkout', requireAuth, async (req, res) => {
  const { expectedTotal } = checkoutBody.parse(req.body ?? {})
  res.status(201).json(await orders.checkout(req.user!, expectedTotal))
})

ordersRouter.get('/orders', requireAuth, async (req, res) => {
  res.json(await orders.listOrders(req.user!))
})

ordersRouter.get('/orders/:id', requireAuth, async (req, res) => {
  res.json(await orders.getOrder(req.user!, uuidParam(req.params.id)))
})
