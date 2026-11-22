import { query } from '#server/database/postgres.ts';
export async function databaseReady() {
  await query('SELECT 1');
}
