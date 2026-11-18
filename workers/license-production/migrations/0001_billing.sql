CREATE TABLE IF NOT EXISTS polaris_billing_installations (
  id_hash TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  trial_ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS polaris_billing_purchase_intents (
  id TEXT PRIMARY KEY,
  installation_hash TEXT NOT NULL,
  claim_hash TEXT NOT NULL,
  claim_expires_at INTEGER NOT NULL,
  session_id TEXT UNIQUE,
  payment_intent_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS polaris_billing_purchases_payment ON polaris_billing_purchase_intents(payment_intent_id);
CREATE TABLE IF NOT EXISTS polaris_billing_licenses (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL UNIQUE REFERENCES polaris_billing_purchase_intents(id),
  key_hash TEXT NOT NULL UNIQUE,
  delivery_cipher TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS polaris_billing_licenses_email ON polaris_billing_licenses(email_hash);
CREATE TABLE IF NOT EXISTS polaris_billing_activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES polaris_billing_licenses(id),
  installation_hash TEXT NOT NULL,
  credential_hash TEXT UNIQUE,
  generation INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  last_validated_at INTEGER,
  UNIQUE(license_id, installation_hash)
);
CREATE TABLE IF NOT EXISTS polaris_billing_stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS polaris_billing_email_deliveries (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES polaris_billing_licenses(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS polaris_billing_rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
