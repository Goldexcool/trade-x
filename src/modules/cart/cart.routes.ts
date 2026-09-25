import { Router } from 'express'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { uuidParam } from '../../shared/validation.ts'
import { setItemBody } from './cart.schema.ts'
import * as cart from './cart.service.ts'

export const cartRouter = Router()

cartRouter.get('/cart', requireAuth, async (req, res) => {
  res.json(await cart.getCart(req.user!.id))
})

cartRouter.put('/cart/items/:productId', requireAuth, async (req, res) => {
  const { quantity } = setItemBody.parse(req.body)
  await cart.setItem(req.user!.id, uuidParam(req.params.productId), quantity)
  res.status(204).end()
})

cartRouter.delete('/cart/items/:productId', requireAuth, async (req, res) => {
  await cart.removeItem(req.user!.id, uuidParam(req.params.productId))
  res.status(204).end()
})
