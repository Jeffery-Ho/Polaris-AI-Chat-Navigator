CREATE TABLE orders (
  id TEXT PRIMARY KEY, license_type TEXT NOT NULL CHECK (license_type IN ('lifetime','subscription')),
  checkout_session_id TEXT NOT NULL UNIQUE, payment_intent_id TEXT, charge_id TEXT, subscription_id TEXT,
  stripe_customer_id TEXT, email TEXT, amount INTEGER, currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','partially_refunded','disputed')),
  amount_refunded INTEGER NOT NULL DEFAULT 0, failure_code TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE licenses (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  type TEXT NOT NULL CHECK (type IN ('lifetime','subscription')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','expired','revoked')),
  revoked_reason TEXT, current_period_end INTEGER, grace_until INTEGER, email TEXT,
  issued_at INTEGER NOT NULL, last_checked_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE activations (
  license_id TEXT NOT NULL REFERENCES licenses(id), install_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, PRIMARY KEY (license_id, install_id));
CREATE TABLE processed_events (
  event_id TEXT PRIMARY KEY, type TEXT NOT NULL, stripe_created INTEGER,
  processed_at INTEGER NOT NULL, result TEXT NOT NULL CHECK (result IN ('ok','ignored')));
CREATE TABLE payouts (
  payout_id TEXT PRIMARY KEY, amount INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
  arrival_date INTEGER, failure_code TEXT, updated_at INTEGER NOT NULL);
