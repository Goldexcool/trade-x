import { z } from 'zod'
import { loginBody, registerBody, resendBody, verifyBody } from '../modules/auth/auth.schema.ts'
import { setItemBody } from '../modules/cart/cart.schema.ts'
import { checkoutBody } from '../modules/orders/orders.schema.ts'
import { listQuery, productBody, productPatch } from '../modules/products/products.schema.ts'

// Request schemas come from the same zod validators the routes use, so the docs can't drift from validation.
function schema(s: z.ZodType) {
  const json = z.toJSONSchema(s, { io: 'input' }) as any
  delete json.$schema
  for (const p of Object.values<any>(json.properties ?? {})) {
    if (p.format === 'email') delete p.pattern // zod's email regex is noise in docs
    if (p.maximum === Number.MAX_SAFE_INTEGER) delete p.maximum
  }
  return json
}

/** A zod object schema as OpenAPI query parameters. */
const queryParams = (s: z.ZodObject) =>
  Object.entries<any>(schema(s).properties).map(([name, sch]) => ({ name, in: 'query', required: false, schema: sch }))

const json = (s: unknown, example?: unknown) => ({ content: { 'application/json': { schema: s, ...(example ? { example } : {}) } } })
const body = (s: z.ZodType, example?: unknown) => ({ required: true, ...json(schema(s), example) })
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const ok = (description: string, s?: unknown) => (s ? { description, ...json(s) } : { description })
const err = (description: string) => ({ description, ...json(ref('Error')) })

const uuidParam = (name: string, description: string) => ({ name, in: 'path', required: true, description, schema: { type: 'string', format: 'uuid' } })
const bearer = [{ bearerAuth: [] }]
const E401 = err('Missing or invalid token')
const E403 = err('Admin only')
const E404 = err('Not found')
const E400 = err('Validation failed')

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Trade-X API',
    version: '1.0.0',
    description: [
      'Mini e-commerce backend: catalog, carts, checkout and Paystack payments.',
      '',
      '**Money is always integer kobo** (₦1 = 100 kobo).',
      '',
      '**To try authenticated routes:**',
      '1. `POST /auth/login` (admin: the `ADMIN_EMAIL` / `ADMIN_PASSWORD` configured on the server)',
      '2. Copy `token` from the response',
      '3. Click **Authorize** and paste it',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Auth', description: 'Sign-up with emailed 6-digit code, login' },
    { name: 'Products', description: 'Catalog browsing (public) and admin CRUD' },
    { name: 'Cart', description: 'Your cart. Always scoped to the logged-in user.' },
    { name: 'Orders', description: 'Checkout (server-side pricing, stock reservation) and order history' },
    { name: 'Payments', description: 'Paystack callback and webhook' },
    { name: 'System' },
  ],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' }, details: {} },
        required: ['error'],
        example: { error: 'Some items are no longer available in the requested quantity', details: { problems: [{ product_id: '…', name: 'Sold Out Hoodie', requested: 1, available: 0 }] } },
      },
      User: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['customer', 'admin'] } },
      },
      Session: { type: 'object', properties: { user: ref('User'), token: { type: 'string', description: 'JWT, valid 1 hour' } } },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: ['string', 'null'] },
          price_kobo: { type: 'integer', example: 2500000 },
          stock: { type: 'integer', description: 'Units available to sell (pending orders already deducted)' },
          is_active: { type: 'boolean' },
          in_stock: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      ProductPage: {
        type: 'object',
        properties: { items: { type: 'array', items: ref('Product') }, page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } },
      },
      Cart: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product_id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                price_kobo: { type: 'integer', description: 'Live price, not a snapshot' },
                quantity: { type: 'integer' },
                subtotal_kobo: { type: 'integer' },
                available: { type: 'boolean', description: 'Active and enough stock for this quantity' },
                in_stock: { type: 'integer' },
              },
            },
          },
          total_kobo: { type: 'integer', description: 'Send this as `expectedTotal` at checkout' },
          checkout_ready: { type: 'boolean' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'paid', 'failed', 'expired', 'refund_required'] },
          total_kobo: { type: 'integer' },
          reference: { type: 'string', example: 'ord-472de000-5046-4833-9a19-6e1dfdbcbbff' },
          authorization_url: { type: ['string', 'null'], description: 'Open this to pay on Paystack' },
          expires_at: { type: 'string', format: 'date-time', description: 'Stock is held until then' },
          paid_at: { type: ['string', 'null'], format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      OrderDetail: {
        allOf: [ref('Order'), {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                description: 'Snapshot at purchase: later catalog edits never change it',
                properties: { product_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, unit_price_kobo: { type: 'integer' }, quantity: { type: 'integer' } },
              },
            },
          },
        }],
      },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Liveness: checks Postgres and Redis', responses: { 200: ok('Healthy', { type: 'object', properties: { ok: { type: 'boolean' } } }) } },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Start sign-up: emails a 6-digit code',
        description: 'Creates an unverified customer account. No token yet: confirm the code at `/auth/verify-email`.',
        requestBody: body(registerBody, { email: 'you@example.com', password: 'password123' }),
        responses: { 202: ok('Code sent'), 400: E400, 409: err('Email already registered'), 429: err('Rate limited'), 502: err('Email could not be sent') },
      },
    },
    '/auth/verify-email': {
      post: {
        tags: ['Auth'], summary: 'Confirm the emailed code → session',
        requestBody: body(verifyBody, { email: 'you@example.com', code: '482913' }),
        responses: { 200: ok('Verified; welcome email queued', ref('Session')), 400: err('Wrong or expired code'), 409: err('Already verified'), 429: err('Too many wrong attempts') },
      },
    },
    '/auth/resend-code': {
      post: {
        tags: ['Auth'], summary: 'Send a new sign-up code (60s cooldown)',
        description: 'Always answers 202, so it cannot be used to discover which emails have accounts.',
        requestBody: body(resendBody, { email: 'you@example.com' }),
        responses: { 202: ok('Accepted') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Log in → JWT',
        requestBody: body(loginBody, { email: 'admin@trade-x.local', password: 'admin12345' }),
        responses: { 200: ok('Logged in', ref('Session')), 401: err('Invalid email or password'), 403: err('Email not verified yet') },
      },
    },

    '/products': {
      get: {
        tags: ['Products'], summary: 'Browse, search and filter the catalog',
        description: 'Public. Prices are in kobo. Admins can pass `includeInactive=true`. Cached for up to 30s.',
        parameters: queryParams(listQuery),
        responses: { 200: ok('A page of products', ref('ProductPage')), 400: E400 },
      },
      post: {
        tags: ['Products'], summary: 'Create a product (admin)', security: bearer,
        requestBody: body(productBody, { name: 'Classic White Sneakers', category: 'shoes', price_kobo: 2500000, stock: 25 }),
        responses: { 201: ok('Created', ref('Product')), 400: E400, 401: E401, 403: E403 },
      },
    },
    '/products/{id}': {
      parameters: [uuidParam('id', 'Product id')],
      get: { tags: ['Products'], summary: 'Product detail', responses: { 200: ok('The product', ref('Product')), 400: E400, 404: E404 } },
      patch: {
        tags: ['Products'], summary: 'Update a product (admin)', security: bearer,
        requestBody: body(productPatch, { price_kobo: 2750000, stock: 30 }),
        responses: { 200: ok('Updated', ref('Product')), 400: E400, 401: E401, 403: E403, 404: E404 },
      },
      delete: {
        tags: ['Products'], summary: 'Deactivate a product (admin, soft delete)', security: bearer,
        responses: { 204: ok('Deactivated'), 401: E401, 403: E403, 404: E404 },
      },
    },

    '/cart': {
      get: { tags: ['Cart'], summary: 'Your cart with live prices', security: bearer, responses: { 200: ok('Cart', ref('Cart')), 401: E401 } },
    },
    '/cart/items/{productId}': {
      parameters: [uuidParam('productId', 'Product id')],
      put: {
        tags: ['Cart'], summary: 'Set quantity of a product (not increment)', security: bearer,
        requestBody: body(setItemBody, { quantity: 1 }),
        responses: { 204: ok('Saved'), 400: E400, 401: E401, 404: err('Product not found or inactive'), 409: err('Not enough stock') },
      },
      delete: { tags: ['Cart'], summary: 'Remove a product from your cart', security: bearer, responses: { 204: ok('Removed'), 401: E401 } },
    },

    '/checkout': {
      post: {
        tags: ['Orders'], summary: 'Check out your cart → Paystack payment link',
        description: [
          'Prices are computed server-side and stock is reserved for 15 minutes.',
          'Send `expectedTotal` (the cart total you showed the customer): if prices changed, you get 409 with the new total and nothing is reserved.',
          'Open `authorization_url` to pay.',
        ].join('\n\n'),
        security: bearer,
        requestBody: { required: false, ...json(schema(checkoutBody), { expectedTotal: 10000 }) },
        responses: {
          201: ok('Order created, stock reserved', ref('Order')),
          400: err('Cart is empty'), 401: E401,
          409: err('Out of stock or prices changed'),
          502: err('Paystack unavailable: cart restored, nothing charged'),
        },
      },
    },
    '/orders': {
      get: { tags: ['Orders'], summary: 'Your orders (admin: all orders)', security: bearer, responses: { 200: ok('Latest 100 orders', { type: 'array', items: ref('Order') }), 401: E401 } },
    },
    '/orders/{id}': {
      parameters: [uuidParam('id', 'Order id')],
      get: { tags: ['Orders'], summary: 'Order with its item snapshot', security: bearer, responses: { 200: ok('Order', ref('OrderDetail')), 401: E401, 404: err("Not found (also for other users' orders)") } },
    },

    '/payments/callback': {
      get: {
        tags: ['Payments'], summary: 'Paystack redirect target: verifies with Paystack and settles the order',
        parameters: [{ name: 'reference', in: 'query', required: true, schema: { type: 'string' } }],
        responses: {
          200: ok('Current order status', { type: 'object', properties: { reference: { type: 'string' }, status: { type: 'string' } } }),
          404: E404, 502: err('Paystack verify failed'),
        },
      },
    },
    '/webhooks/paystack': {
      post: {
        tags: ['Payments'], summary: 'Paystack webhook (signed; not callable by hand)',
        description: 'Body must be signed: `x-paystack-signature` = HMAC-SHA512 of the raw body with the secret key. Each event is applied exactly once.',
        parameters: [{ name: 'x-paystack-signature', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, ...json({ type: 'object' }, { event: 'charge.success', data: { id: 6595000819, reference: 'ord-…', amount: 10000 } }) },
        responses: { 200: ok('Processed or duplicate'), 401: err('Invalid signature') },
      },
    },
  },
}
