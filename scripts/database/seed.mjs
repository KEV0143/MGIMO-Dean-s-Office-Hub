import pg from 'pg';
import { seedDemoData } from './seed-data.mjs';

const contest = process.env.CONTEST_MODE === 'true';
const local = process.env.DEMO_MODE === 'true';
if (contest === local) throw new Error('Set exactly one of DEMO_MODE or CONTEST_MODE to true.');

const contestPasswords = new Map(
  ['student', 'student2', 'dean'].map((name) => [
    name,
    process.env['CONTEST_' + name.toUpperCase() + '_PASSWORD']
  ])
);
if (contest) {
  const origin = new URL(process.env.ORIGIN ?? '');
  const passwords = [...contestPasswords.values()];
  if (origin.protocol !== 'https:' || origin.origin !== process.env.ORIGIN)
    throw new Error('Contest seed requires a canonical HTTPS ORIGIN.');
  if (
    passwords.some((password) => !password || !/^[a-fA-F0-9]{40,128}$/.test(password)) ||
    new Set(passwords.map((password) => password?.toLowerCase())).size !== passwords.length
  )
    throw new Error('Generate distinct contest passwords as directed in docs/deployment.md.');
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query('BEGIN');
  const created = await seedDemoData(db, { contestPasswords: contest ? contestPasswords : null });
  await db.query('COMMIT');
  console.log(
    created
      ? 'Demo data created. Existing data is never reset by this script.'
      : 'Database already has users. Demo seed skipped; no data changed.'
  );
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
