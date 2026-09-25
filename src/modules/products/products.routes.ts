import { Router } from 'express'
import { requireAdmin } from '../../shared/middleware/auth.middleware.ts'
import { uuidParam } from '../../shared/validation.ts'
import { listQuery, productBody, productPatch } from './products.schema.ts'
import * as products from './products.service.ts'

export const productsRouter = Router()

productsRouter.get('/products', async (req, res) => {
  const { includeInactive, ...filters } = listQuery.parse(req.query)
  res.json(await products.listProducts(filters, req.user?.role === 'admin' && includeInactive === 'true'))
})

productsRouter.get('/products/:id', async (req, res) => {
  res.json(await products.getProduct(uuidParam(req.params.id), req.user?.role === 'admin'))
})

productsRouter.post('/products', requireAdmin, async (req, res) => {
  res.status(201).json(await products.createProduct(productBody.parse(req.body)))
})

productsRouter.patch('/products/:id', requireAdmin, async (req, res) => {
  res.json(await products.updateProduct(uuidParam(req.params.id), productPatch.parse(req.body)))
})

productsRouter.delete('/products/:id', requireAdmin, async (req, res) => {
  await products.deactivateProduct(uuidParam(req.params.id))
  res.status(204).end()
})
