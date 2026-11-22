import { PGlite } from '@electric-sql/pglite';
import { seedDemoData } from '../database/seed-data.mjs';

let database;

async function openDatabase() {
  const { migrations } = await import('deka-pages:migrations');
  const db = await PGlite.create({
    dataDir: 'idb://deka-contest-cabinet',
    parsers: {
      20: (value) => value,
      1082: (value) => new Date(value),
      1114: (value) => new Date(value + 'Z'),
      1184: (value) => new Date(value).toISOString()
    }
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pages_schema_migrations (name text PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS pages_session (id boolean PRIMARY KEY CHECK(id), token text NOT NULL);
  `);
  await db.transaction(async (tx) => {
    const applied = new Set(
      (await tx.query('SELECT name FROM pages_schema_migrations')).rows.map((row) => row.name)
    );
    for (const [name, migration] of migrations) {
      if (applied.has(name)) continue;
      await tx.exec(migration);
      await tx.query('INSERT INTO pages_schema_migrations VALUES ($1)', [name]);
    }
    await seedDemoData(tx);
  });
  return db;
}

export async function query(sql, params = []) {
  database ??= openDatabase();
  return (await database).query(sql, params);
}

export async function transaction(operation) {
  database ??= openDatabase();
  return (await database).transaction(operation);
}
