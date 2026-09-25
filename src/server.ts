import express from 'express'
import { config } from './config/env.ts'
import { connect, db } from './database/data-source.ts'
import { redis } from './database/redis.ts'
import { authRouter } from './modules/auth/auth.routes.ts'
import { seedAdmin } from './modules/auth/auth.service.ts'
import { cartRouter } from './modules/cart/cart.routes.ts'
import { ordersRouter } from './modules/orders/orders.routes.ts'
import { paymentsRouter } from './modules/payments/payments.routes.ts'
import { productsRouter } from './modules/products/products.routes.ts'
import { errorHandler } from './shared/errors.ts'
import { authenticate } from './shared/middleware/auth.middleware.ts'

const app = express()
app.disable('x-powered-by')
app.use(paymentsRouter) // needs the raw body: before express.json()
app.use(express.json({ limit: '100kb' }))
app.use(authenticate)
app.get('/health', async (_req, res) => {
  await db.query('SELECT 1')
  await redis.ping()
  res.json({ ok: true })
})
app.use(authRouter, productsRouter, cartRouter, ordersRouter)
app.use((_req, res) => { res.status(404).json({ error: 'Not found' }) })
app.use(errorHandler)

await connect({ migrate: true })
await seedAdmin()
app.listen(config.port, () => console.log(`api listening on :${config.port}`))
