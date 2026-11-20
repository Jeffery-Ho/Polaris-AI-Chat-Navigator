import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const migrations = new URL("../migrations/", import.meta.url);

export function database() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, migrations), "utf8"));
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
