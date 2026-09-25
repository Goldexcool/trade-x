-- Idempotent schema, applied on boot (migrations are serialised by an advisory lock in data-source.ts).

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  category    text,
  price_kobo  integer NOT NULL CHECK (price_kobo > 0),
  -- units available to sell (pending orders have already been deducted).
  -- The CHECK is the last line of defence against overselling.
  stock       integer NOT NULL CHECK (stock >= 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_catalog_idx ON products (is_active, created_at DESC);

-- Cart stores quantities only, never prices: price is always read live (Scenario B).
CREATE TABLE IF NOT EXISTS cart_items (
  user_id    uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products,
  quantity   integer NOT NULL CHECK (quantity > 0),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users,
  status            text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refund_required')),
  total_kobo        integer NOT NULL CHECK (total_kobo > 0),
  reference         text UNIQUE NOT NULL,
  authorization_url text,
  expires_at        timestamptz NOT NULL,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pending_idx ON orders (created_at) WHERE status = 'pending';

-- Snapshot of what was bought, at the price charged.
CREATE TABLE IF NOT EXISTS order_items (
  order_id        uuid NOT NULL REFERENCES orders ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products,
  name            text NOT NULL,
  unit_price_kobo integer NOT NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);

-- One row per processed gateway event. The PK is the idempotency key (Scenario E).
CREATE TABLE IF NOT EXISTS webhook_events (
  event_key   text PRIMARY KEY,
  event       text NOT NULL,
  reference   text,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
