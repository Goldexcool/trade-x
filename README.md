# Trade-X

Mini e-commerce backend: products, carts, checkout, and Paystack payments. It uses Node 24 (running TypeScript directly with no build step), Express 5, TypeORM on Postgres (Neon) and Redis 7, all run with Docker Compose.

The engineering scenarios (concurrency, price changes, failures, webhooks, reservations) are covered in **[DESIGN.md](DESIGN.md)**.

## Run

```bash
cp .env.example .env   # fill in DATABASE_URL, PAYSTACK_SECRET_KEY (sandbox sk_test_…) and JWT_SECRET
docker compose up -d --build
curl localhost:3000/health
```

Services:

- `api` on :3000
- `worker` (payment reconciler)
- `redis`

Postgres is external (Neon, via `DATABASE_URL`). The `api` runs TypeORM migrations on boot (`src/database/migrations/`). An admin user is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Project structure

```
src/
  server.ts, worker.ts          entry points (HTTP api, payment reconciler)
  config/env.ts                 env parsing
  database/                     TypeORM DataSource, Redis client, SQL migrations
  shared/                       HttpError + error handler, auth & rate-limit middleware, validation helpers
  modules/<name>/
    <name>.routes.ts            HTTP only: parse input, call service, send status
    <name>.service.ts           business logic + TypeORM queries
    <name>.schema.ts            zod input schemas
    <entity>.entity.ts          TypeORM EntitySchema
  modules/orders/settlement.service.ts   settle(): the order state machine
  modules/orders/inventory.service.ts    stock locking / reserve / release
  modules/payments/paystack.client.ts    Paystack API + signature check
test/scenarios.test.ts          Scenarios A–F against real Postgres
```

## Tests

The scenario tests (A–F) run against a throwaway local Postgres (tmpfs), never Neon:

```bash
docker compose --profile test run --rm test
```

## API

Amounts are integer **kobo**. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{email, password}` → 202; emails a 6-digit code (always a customer) |
| POST | `/auth/verify-email` | public | `{email, code}` → `{user, token}`; sends the welcome email |
| POST | `/auth/resend-code` | public | `{email}` → 202 (60s cooldown per email) |
| POST | `/auth/login` | public | `{email, password}` → `{user, token}`; 403 until the email is verified |
| GET | `/products` | public | `q, category, minPrice, maxPrice, inStock, sort=newest\|price_asc\|price_desc, page, limit` (admin: `includeInactive=true`) |
| GET | `/products/:id` | public | |
| POST | `/products` | admin | `{name, description?, category?, price_kobo, stock, is_active?}` |
| PATCH | `/products/:id` | admin | any subset of the above |
| DELETE | `/products/:id` | admin | soft delete (`is_active=false`) |
| GET | `/cart` | customer | live prices + `available` flag per line |
| PUT | `/cart/items/:productId` | customer | `{quantity}` (set, not increment) |
| DELETE | `/cart/items/:productId` | customer | |
| POST | `/checkout` | customer | `{expectedTotal?}` → order + Paystack `authorization_url` |
| GET | `/orders`, `/orders/:id` | owner / admin | |
| GET | `/payments/callback?reference=` | public | Paystack redirect target; verifies with Paystack |
| POST | `/webhooks/paystack` | Paystack | HMAC-SHA512 signed |

## Quick walkthrough

```bash
ADMIN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@trade-x.local","password":"admin12345"}' | jq -r .token)

PID=$(curl -s localhost:3000/products -H "authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"name":"Sneakers","price_kobo":2500000,"stock":2}' | jq -r .id)

curl -s localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'          # → check your inbox for the code

TOKEN=$(curl -s localhost:3000/auth/verify-email -H 'content-type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}' | jq -r .token)

curl -s -X PUT localhost:3000/cart/items/$PID -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"quantity":1}'

curl -s -X POST localhost:3000/checkout -H "authorization: Bearer $TOKEN"   # → open authorization_url
```

Pay with Paystack's test card `4084 0840 8408 4081`, CVV `408`, any future expiry, PIN `0000`, OTP `123456`.

## Email

Trade-X sends transactional email through Brevo (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`):

- sign-up code
- welcome
- receipt
- payment not completed

Leave `BREVO_API_KEY` empty to print emails to the log instead of sending them. Set `APP_URL` to show a "back to the store" button.

```bash
npm run email:preview   # renders every template to .email-previews/
```

The visual system is documented in [EMAIL_DESIGN.md](EMAIL_DESIGN.md).

## Deploy (Render)

`render.yaml` is a Blueprint (Dashboard → New → Blueprint). One free web service runs the whole app:

- **Redis is built into the image.** When `REDIS_URL` isn't set, `docker-entrypoint.sh` starts a private in-memory Redis inside the container. Locally, Compose sets `REDIS_URL` to its own Redis container, so the embedded one stays off. A restart only drops short-lived data: pending sign-up codes, rate-limit counters and the catalog cache.
- **`RUN_WORKER=true`** makes the API also run the background jobs (payment reconciler and email outbox).

To scale later, set `REDIS_URL` to a managed Redis, set `RUN_WORKER=false`, and run `node src/worker.ts` as a separate worker.

## Webhooks (after deploy)

Set the webhook URL in Paystack Dashboard → Settings → API Keys & Webhooks to `https://<your-domain>/webhooks/paystack`. Also set `PAYSTACK_CALLBACK_URL=https://<your-domain>/payments/callback`.

Until then, payments still settle through two other paths:

- the callback redirect
- the `worker` reconciler, which polls Paystack every 60s
# trade-x
