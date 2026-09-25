# Trade-X — Design

A small e-commerce backend: catalog, carts, checkout, and Paystack payments. It runs as two processes built from the same image. `api` serves HTTP, and `worker` reconciles payments. They share **PostgreSQL** (Neon, accessed through TypeORM), which is the source of truth, and **Redis**, which holds a cache, rate-limit counters and a leader lock.

Redis never decides who gets stock or whether an order is paid. **Every correctness guarantee in this document is enforced by Postgres transactions, row locks and constraints.** If Redis goes down, the catalog cache and rate limits fail open, and the reconciler lock stops being acquired until Redis is back.

## Data model

TypeORM entities live next to their module (`src/modules/*/*.entity.ts`, `EntitySchema`, no decorators). The schema itself is a hand-written SQL migration (`src/database/migrations/`), because the CHECK constraints are part of the correctness guarantees. Row locks use TypeORM's `setLock('pessimistic_write')`, which emits `SELECT … FOR UPDATE`.

| Table | Purpose |
|---|---|
| `users` | email, bcrypt hash, `role ∈ {customer, admin}` |
| `products` | `price_kobo`, `stock` (**units available to sell**; pending orders are already deducted), `is_active`. `CHECK (stock >= 0)` |
| `cart_items` | `(user_id, product_id) → quantity`. **No price column.** |
| `orders` | `status ∈ {pending, paid, failed, expired, refund_required}`, `total_kobo`, unique Paystack `reference`, `expires_at` |
| `order_items` | Snapshot at purchase: product name, `unit_price_kobo`, quantity |
| `webhook_events` | One row per processed gateway event; the PK `event_key` is the idempotency key |

Money is stored as integer kobo everywhere, so there are no floats.

### Order state machine

```
            ┌── charge success, amount ok ──────────────► paid
 pending ───┼── charge failed / reversed ─(stock back)──► failed ──┐
            ├── unpaid past expires_at ──(stock back)──► expired ─┤── late charge success:
            └── amount mismatch ─────────(stock back)──► refund_required   re-take stock → paid
                                                                   │       or sold out → refund_required
```

All transitions out of `pending` go through a single function, `settle()` in `src/modules/orders/settlement.service.ts`. Webhooks, the browser callback and the background reconciler all call it. It starts with `SELECT … FOR UPDATE` on the order row and only acts when the current status allows the transition.

### Auth & tenant boundaries (no IDOR)

- JWT (HS256, 1h). Registration always creates `customer`. The admin is seeded from env.
- **Carts have no id.** Every cart query uses `WHERE user_id = <jwt sub>`, so there is nothing a client can swap.
- Orders are fetched with `WHERE id = $1 AND (user_id = $me OR is_admin)`. Someone else's order returns **404, not 403**, so its existence isn't confirmed.
- Product writes require `admin`. Customers never see inactive products.
- `/auth/*` is rate-limited per IP in Redis (10/min).

### Lock ordering (deadlock avoidance)

Every path locks **the `orders` row first, then `products` rows in ascending `id`** (`ORDER BY p.id FOR UPDATE`). Checkout, compensation, settlement, late re-reservation and release all follow this order, so two transactions can never wait on each other in a cycle.

---

## Scenario A — Concurrent stock purchase

*Two customers buy the last 2 units at the same millisecond.*

`placeOrder()` runs in one transaction:

1. `SELECT … FROM cart_items JOIN products … ORDER BY p.id FOR UPDATE` locks the product rows.
2. It checks `stock >= quantity` against the **locked** row.
3. `UPDATE products SET stock = stock - qty`.

The second transaction blocks at step 1 until the first commits. It then re-reads the row (Postgres READ COMMITTED re-evaluates locked rows), sees the reduced stock, and gets a `409` listing `requested` and `available`. The check-then-decrement race cannot happen because the check runs under the lock.

`CHECK (stock >= 0)` is a backstop. If any future code path forgets the lock, the database rejects the write instead of overselling.

We chose a pessimistic row lock over optimistic retries or a Redis counter. Contention only happens per product, the lock lasts milliseconds (there is no network I/O inside the transaction), and it keeps a single source of truth.

**Test:** `test/scenarios.test.ts › A`. Five buyers race for 2 units; exactly 2 orders succeed and stock ends at 0.

## Scenario B — Price changes while items sit in carts

- The cart stores **only `product_id` and `quantity`**. `GET /cart` always joins live prices and flags each line `available` (active and enough stock).
- At checkout the server computes the total from the locked product rows. **The client never supplies a price.**
- The client may send `expectedTotal` (the total it showed the user). If the server total differs, checkout returns `409 Prices changed` with the new total and line prices, and reserves nothing. The client shows the new price and re-submits. This way a customer is never charged a price they didn't see, and the server stays authoritative.
- Deactivated products and quantities over stock are reported as `problems` with the same `409`.
- `order_items` snapshots name and `unit_price_kobo`. Later catalog edits never change a placed order.

**Test:** `› B`. A stale total is rejected, the order uses the new price, and a later price change leaves the snapshot alone.

## Scenario C — Partial checkout failures

Checkout has two parts and must never leave them half-done.

**Step 1: one DB transaction.** Validate, create the order, snapshot the items, decrement stock, and remove the purchased lines from the cart. Any error (validation, constraint, crash) triggers `ROLLBACK`, so all of it happens or none of it does. Only the ordered product ids are removed from the cart, so an item added in another tab mid-checkout is not lost.

**Step 2: Paystack `initialize`, outside the transaction.** Row locks are never held across an HTTP call. If it fails (timeout, 5xx, bad key), a **compensating transaction** `cancelUnpaid()` does three things:

- marks the order `failed`, but only while it is still `pending`
- returns the stock
- puts the items back in the cart

It then responds `502 "nothing was charged"`. The status guard makes compensation idempotent: running it twice returns stock once.

What if init succeeded at Paystack but our response timed out? The order is `failed`, but if the customer somehow pays, the `charge.success` webhook still arrives and `settle()` takes the late-payment path (Scenario F).

Saving `authorization_url` after init is best-effort, because the order is already valid without it.

**Test:** `› C`. A mid-checkout failure leaves stock, cart and orders untouched, and the compensation is idempotent.

## Scenario D — Abandoned browser on payment

The customer is redirected to Paystack and closes the tab. The redirect back never happens, and a webhook may be delayed or lost. Three independent paths converge on the same idempotent `settle()`:

1. **Webhook** `POST /webhooks/paystack`. Paystack pushes `charge.success`. This is the primary path.
2. **Callback** `GET /payments/callback?reference=…`. If the browser does come back, we **ignore the query string's claims** and call Paystack's `verify` API with the reference.
3. **Reconciler worker** (`src/worker.ts` → `reconcilePending()` in `src/modules/payments/payments.service.ts`, every 60s). It lists `pending` orders older than 1 minute and calls `verify` on each one:
   - `success` → paid.
   - `failed` → released.
   - `abandoned` or `ongoing` before `expires_at` → left alone, because the customer may still pay.
   - Past `expires_at` without payment → `expired` and stock released.
   - If Paystack is unreachable, the order is treated as not paid yet. After expiry that releases stock, which is safe because a late success is still handled.

   Only one worker replica runs a pass at a time, using a Redis `SET NX EX` lock. Even if two ran, `settle()` makes it harmless.

The **reference** (`ord-<uuid>`) is generated by us, stored with a unique constraint, and passed to Paystack. It is the join key for all three paths and cannot be guessed.

**Test:** `› D`. `abandoned` before expiry stays pending with stock held; after expiry it becomes `expired` and stock returns.

## Scenario E — Duplicate webhooks

Paystack retries deliveries, and networks duplicate them.

1. **Authenticity.** HMAC-SHA512 of the **raw** request body with the secret key, compared to `x-paystack-signature` using `timingSafeEqual`. The route is mounted before `express.json()` so the exact bytes are hashed. A bad signature gets `401`.
2. **Dedupe.** `INSERT INTO webhook_events (event_key …) ON CONFLICT DO NOTHING`, where `event_key = "<event>:<paystack transaction id>"`. This insert and the `settle()` state change are in **the same transaction**:
   - A duplicate that arrives later inserts 0 rows and returns `duplicate`.
   - A duplicate that arrives *concurrently* blocks on the PK until the first commits, then inserts 0 rows.
   - If the first attempt crashes and rolls back, the dedupe row rolls back too, so the retry is processed. There's no "marked seen but never applied" gap.
3. **State guard.** Even across *different* event keys (webhook, then reconciler, then callback for the same payment), `settle()` sees `paid` and does nothing.

As a result, one payment produces exactly one `paid` transition and no extra inventory movement. There are no duplicate orders either, because orders are created only by checkout, never by webhooks. Paystack also rejects a reused `reference`, so a transaction can't be initialized twice.

**Test:** `› E`. The same event is fired 3× concurrently; results are `[paid, duplicate, duplicate]`, there is one `webhook_events` row, and stock moves once.

## Scenario F — Inventory and failed payments

**Decision: reserve at checkout, with an expiry.** We don't deduct on payment success.

| | Deduct on payment success | **Reserve at checkout (chosen)** |
|---|---|---|
| Oversell risk | Two customers can both pay for the last unit, and one then needs a refund | Impossible: a paying customer always has stock held |
| Stock held by non-payers | None | Yes, until `expires_at` (default 15 min, `RESERVATION_MINUTES`) |
| Complexity | Refund flow on the hot path | Expiry and release job |

The reservation *is* the stock decrement. `products.stock` means "available to sell", and a `pending` order holds its units until it resolves.

- **Payment failed** (`failed` or `reversed` from verify): release immediately, order becomes `failed`.
- **Never paid:** once past `expires_at`, the reconciler releases stock and the order becomes `expired`.
- **Late success** after release, which happens because Paystack can still complete a checkout the customer left open. `settle()` locks the products and **re-takes stock if it is still available** → `paid`. If someone else bought it meanwhile → `refund_required`, which is surfaced to admins via `GET /orders`. We never oversell to honour a late payment.
- **Amount mismatch** (paid amount ≠ `total_kobo`): release, then `refund_required`.

**Test:** `› F`. Failure releases stock; a late success re-reserves it; a late success after a sell-out is flagged for refund with stock still at 0.

---

## Email: sign-up codes and the transactional outbox

**Sign-up codes (OTP).** Registration creates an *unverified* account and emails a 6-digit code. Login returns `403` until the code is confirmed at `/auth/verify-email`.

- **Storage:** codes live in Redis as an HMAC (never the code itself), with a 10-minute TTL.
- **Single use:** a code is deleted as soon as it is accepted.
- **Attempt limit:** it is burned after 5 wrong attempts.
- **Resend:** limited to one per 60 seconds per email, and `/auth/resend-code` answers the same way whether or not the account exists.

The code is sent synchronously, because the user is waiting for it; a Brevo failure returns `502` and the user can resend. Sign-up depends on Redis; everything else still fails open.

**Outbox.** Every other email is written to `email_outbox` **inside the same transaction as the state change that causes it**:

- `settle()` marking an order paid, failed or expired
- verification queueing the welcome email

A unique `dedupe_key` (`order-paid:<id>`, `welcome:<userId>`) turns duplicate webhooks, reconciler passes and callbacks into no-ops, the same guarantee Scenario E gives stock. A rolled-back change never emails anyone. The worker drains the outbox every 5 seconds:

- It claims rows with `FOR UPDATE SKIP LOCKED`, so any number of workers is safe.
- A failed send retries with exponential backoff (30s, doubling, capped at 1h) and gives up after 8 attempts.
- A crash between Brevo accepting a message and the row being marked sent can deliver that one email twice. That's at-least-once delivery, the accepted trade-off for email.

## Known limits / next steps

- **Refunds are flagged, not executed.** `refund_required` orders need an admin action or a Paystack refund API call, and they send no customer email yet.
- **Admin stock edits are absolute** (`stock = N` means N more units to sell). A stock delta endpoint would avoid overwriting concurrent checkouts.
- **Catalog cache staleness:** product lists are cached 30s and invalidated on every admin write. Stock shown in the list can lag checkouts by up to 30s. This affects display only, since checkout re-validates under lock.
- **No refresh tokens**; the 1h JWT carries the role, so a demoted admin keeps access until the token expires.
- The reconciler only scans `pending` orders. Late payments on already-expired orders rely on the webhook, which Paystack retries.
