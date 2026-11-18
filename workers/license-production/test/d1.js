import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_billing.sql", import.meta.url), "utf8"));
  function prepared(sql, args = []) {
    return {
      bind(...values) { return prepared(sql, values); },
      first() { return Promise.resolve(db.prepare(sql).get(...args) || null); },
      all() { return Promise.resolve({ results: db.prepare(sql).all(...args) }); },
      run() { return Promise.resolve({ meta: { changes: db.prepare(sql).run(...args).changes } }); },
      _run() { db.prepare(sql).run(...args); }
    };
  }
  return {
    prepare: prepared,
    async batch(statements) {
      db.exec("BEGIN");
      try { for (const statement of statements) statement._run(); db.exec("COMMIT"); return []; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
    close() { db.close(); }
  };
}
