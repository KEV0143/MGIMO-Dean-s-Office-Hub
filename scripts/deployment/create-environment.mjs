import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = new URL('../../.local/config/', import.meta.url);
await mkdir(directory, { recursive: true });
const target = new URL('compose.env', directory);
const args = process.argv.slice(2);
let settings = 'APP_ORIGIN=http://localhost:5180\nAPP_PORT=5180\nDEKA_VERSION=local\n';
if (args.length) {
  const [flag, value] = args;
  const origin = new URL(value);
  if (
    args.length !== 2 ||
    flag !== '--contest-origin' ||
    origin.origin !== value ||
    origin.protocol !== 'https:' ||
    origin.port ||
    !origin.hostname.includes('.')
  )
    throw new Error('Usage: create-environment.mjs [--contest-origin https://your-domain]');
  settings = [
    'APP_ORIGIN=' + origin.origin,
    'APP_PORT=5180',
    'DEKA_VERSION=contest',
    'CONTEST_MODE=true',
    'DEMO_MODE=false',
    'SEED_DEMO_MODE=false',
    'DEKA_ADDRESS_HEADER=X-Forwarded-For',
    ...['STUDENT', 'STUDENT2', 'DEAN'].map(
      (name) => 'CONTEST_' + name + '_PASSWORD=' + randomBytes(24).toString('hex')
    ),
    ''
  ].join('\n');
}
await writeFile(
  target,
  `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nAPP_DB_PASSWORD=${randomBytes(24).toString('hex')}\n${settings}`,
  { flag: 'wx', mode: 0o600 }
);
console.log('Created .local/config/compose.env. Existing credentials are never replaced.');
