import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const legacy = readFileSync(new URL('./fixtures/legacy-schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0002_billing_namespace.sql', import.meta.url), 'utf8');

test('billing migration is repeatable and preserves the deployed legacy schema and rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(legacy);
    db.exec("INSERT INTO orders(id,license_type,checkout_session_id,created_at,updated_at) VALUES('old-order','lifetime','old-session',1,1)");
    db.exec("INSERT INTO licenses(id,order_id,type,status,issued_at,updated_at) VALUES('old-license','old-order','lifetime','active',1,1)");
    const oldSchema = db.prepare("SELECT sql FROM sqlite_schema WHERE name='licenses'").get().sql;
    db.exec(migration); db.exec(migration);
    assert.equal(db.prepare("SELECT status FROM licenses WHERE id='old-license'").get().status, 'active');
    assert.equal(db.prepare("SELECT sql FROM sqlite_schema WHERE name='licenses'").get().sql, oldSchema);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM polaris_billing_licenses').get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name LIKE 'polaris_billing_%'").get().count, 7);
  } finally { db.close(); }
});
