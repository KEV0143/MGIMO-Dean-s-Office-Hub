import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import pg from 'pg';

const source = new URL(process.env.DATABASE_URL ?? '');
assert.equal(source.hostname, '127.0.0.1', 'This fixture requires a local PostgreSQL server.');
assert.equal(process.env.DEMO_MODE, 'true', 'This fixture requires an explicit demo installation.');
const database = 'deka_scale_' + randomBytes(6).toString('hex');
const target = new URL(source);
target.pathname = '/' + database;
const port = 5187;
const origin = 'http://127.0.0.1:' + port;
const env = {
  ...process.env,
  DATABASE_URL: target.href,
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: String(port),
  ORIGIN: origin,
  BUILD_DIRECTORY: '.test-build/scale',
  CONTEST_MODE: 'false',
  AI_BASE_URL: ''
};
const run = promisify(execFile);
const owner = new pg.Client({ connectionString: source.href });
const fixture = new pg.Client({ connectionString: target.href });
let created = false;
let fixtureConnected = false;
let server;
let serverLog = '';
await owner.connect();
try {
  await owner.query('CREATE DATABASE "' + database + '"');
  created = true;
  await run(process.execPath, ['scripts/database/migrate.mjs'], { env });
  await run(process.execPath, ['scripts/database/seed.mjs'], { env });
  await fixture.connect();
  fixtureConnected = true;
  await fixture.query(`
    INSERT INTO study_groups(id,faculty_id,name,course,program)
    SELECT gen_random_uuid(),id,'Нагрузка-' || n,2,'Тестовая программа'
    FROM faculties CROSS JOIN generate_series(1,250) n;
    INSERT INTO users(id,email,password_hash,full_name,role,faculty_id,group_id)
    SELECT gen_random_uuid(),'load-' || substring(g.name from '[0-9]+$') || '-' || n || '@deka.test',u.password_hash,
      'Синтетический студент ' || n,'student',g.faculty_id,g.id
    FROM study_groups g JOIN users u ON u.email='student@deka.test'
    CROSS JOIN generate_series(1,20) n WHERE g.name LIKE 'Нагрузка-%';
    INSERT INTO teaching_assignments(teacher_id,subject_id,group_id)
    SELECT '00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000020',g.id
    FROM study_groups g WHERE g.name LIKE 'Нагрузка-%';
    INSERT INTO lessons(id,subject_id,group_id,teacher_id,starts_at,ends_at,room,kind)
    SELECT gen_random_uuid(),s.id,g.id,t.id,b.base_start+n*interval '3 hours',
      b.base_start+n*interval '3 hours'+interval '90 minutes','Синт-' || n,'lecture'
    FROM study_groups g CROSS JOIN generate_series(1,180) n
    CROSS JOIN (SELECT date_trunc('week',now())+interval '7 minutes' AS base_start) b
    JOIN subjects s ON s.id='00000000-0000-4000-8000-000000000020'
    JOIN users t ON t.email='teacher@deka.test';
    INSERT INTO requests(id,student_id,faculty_id,kind,details,status,created_at)
    SELECT gen_random_uuid(),u.id,u.faculty_id,'study','Синтетический запрос ' || n,
      CASE WHEN n=1 THEN 'new' ELSE 'done' END,now()-n*interval '1 hour'
    FROM users u CROSS JOIN generate_series(1,5) n WHERE u.email LIKE 'load-%@deka.test';
    INSERT INTO requests(id,student_id,faculty_id,kind,details,status,created_at)
    SELECT gen_random_uuid(),u.id,u.faculty_id,'study','Синтетическая заявка ' || n,'done',
      now()-n*interval '2 hours'
    FROM users u CROSS JOIN generate_series(1,180) n WHERE u.email='student@deka.test';
    ANALYZE;
  `);
  const {
    rows: [data]
  } = await fixture.query(`
    SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM study_groups) groups,
      (SELECT count(*)::int FROM lessons) lessons,(SELECT count(*)::int FROM requests) requests
  `);
  await fixture.end();
  fixtureConnected = false;
  await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
    env,
    maxBuffer: 4 * 1024 * 1024
  });
  server = spawn(process.execPath, [env.BUILD_DIRECTORY + '/index.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  for (const stream of [server.stdout, server.stderr])
    stream.on('data', (value) => (serverLog = (serverLog + value).slice(-4000)));
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Benchmark server stopped: ' + serverLog);
    const healthy = await fetch(origin + '/health', { signal: AbortSignal.timeout(700) }).then(
      (value) => value.ok,
      () => false
    );
    if (healthy) break;
    if (i === 59) throw Error('Benchmark server did not start: ' + serverLog);
    await delay(100);
  }
  const baseArgs = ['scripts/testing/benchmark-portal.mjs', origin, '720'];
  const single = await run(process.execPath, baseArgs);
  const cohort = await run(process.execPath, [...baseArgs, 'student-cohorts']);
  console.log(
    JSON.stringify(
      { data, ...JSON.parse(single.stdout), cohort: JSON.parse(cohort.stdout) },
      null,
      2
    )
  );
} finally {
  try {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    if (fixtureConnected) await fixture.end();
    if (created) await owner.query('DROP DATABASE "' + database + '" WITH (FORCE)');
  } finally {
    await owner.end();
  }
}
