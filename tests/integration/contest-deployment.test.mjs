import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { test } from 'node:test';
import pg from 'pg';

test('Contest login accepts only provisioned demo accounts and issues secure site-scoped sessions', async () => {
  const origin = 'https://deka.example';
  const base = new URL(process.env.TEST_DATABASE_URL ?? '');
  assert.match(base.pathname, /^\/deka_test_[0-9a-f]{12}$/);
  assert.equal(base.hostname, '127.0.0.1');
  const temporary = 'deka_test_' + randomBytes(6).toString('hex');
  const target = new URL(base);
  target.pathname = '/' + temporary;
  const passwords = Object.fromEntries(
    ['student', 'student2', 'dean'].map((user) => [user, randomBytes(24).toString('hex')])
  );
  const env = {
    ...process.env,
    DATABASE_URL: target.href,
    DEMO_MODE: 'false',
    CONTEST_MODE: 'true',
    ORIGIN: origin,
    ADDRESS_HEADER: '',
    CONTEST_STUDENT_PASSWORD: passwords.student,
    CONTEST_STUDENT2_PASSWORD: passwords.student2,
    CONTEST_DEAN_PASSWORD: passwords.dean
  };
  const run = promisify(execFile);
  const db = new pg.Client({ connectionString: base.href });
  let server;
  let created = false;
  await db.connect();
  try {
    await db.query('CREATE DATABASE "' + temporary + '"');
    created = true;
    await run(process.execPath, ['scripts/database/migrate.mjs'], { env });
    await run(process.execPath, ['scripts/database/seed.mjs'], { env });
    await assert.rejects(
      run(process.execPath, ['scripts/database/seed.mjs'], { env }),
      /fresh database/
    );
    await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
      env: { ...env, BUILD_DIRECTORY: '.test-build/contest' },
      maxBuffer: 4 * 1024 * 1024
    });

    Object.assign(process.env, env);
    const { handler } = await import('../../.test-build/contest/handler.js');
    server = createServer(handler).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = 'http://127.0.0.1:' + server.address().port;

    async function request(path, cookie, data, sender = origin) {
      return fetch(address + path, {
        method: data ? 'POST' : 'GET',
        headers: { accept: 'text/html', origin: sender, ...(cookie ? { cookie } : {}) },
        body: data ? new URLSearchParams(data) : undefined,
        redirect: 'manual'
      });
    }

    const page = await request('/login');
    assert.equal(page.status, 200);
    assert.ok(page.headers.get('content-security-policy')?.includes("object-src 'none'"));
    assert.ok(page.headers.has('strict-transport-security'));
    const loginPage = await page.text();
    assert.match(loginPage, /Конкурсный прототип/);
    assert.doesNotMatch(loginPage, /name="account"/);
    for (const password of Object.values(passwords)) assert.ok(!loginPage.includes(password));
    assert.equal((await request('/login', '', { account: 'admin' })).status, 403);
    for (const account of ['student', 'student2', 'dean', 'teacher', 'admin']) {
      const response = await request('/login', '', {
        email: account + '@deka.test',
        password: 'Deka2026!'
      });
      assert.equal(response.status, 400, account);
    }
    assert.equal(
      (
        await request(
          '/login',
          '',
          { email: 'student@deka.test', password: passwords.student },
          'https://different.example'
        )
      ).status,
      403
    );

    const cookies = {};
    for (const [account, password] of Object.entries(passwords)) {
      const response = await request('/login', '', { email: account + '@deka.test', password });
      assert.equal(response.status, 303, account);
      const cookie = response.headers.get('set-cookie');
      assert.ok(/; Secure/i.test(cookie));
      assert.ok(/; HttpOnly/i.test(cookie));
      assert.ok(/; SameSite=Lax/i.test(cookie));
      cookies[account] = cookie.split(';', 1)[0];
    }
    const personal = '/requests/00000000-0000-4000-8000-000000000030';
    assert.equal((await request(personal, cookies.student)).status, 200);
    assert.equal((await request(personal, cookies.student2)).status, 404);
    assert.equal((await request(personal, cookies.dean)).status, 200);
    const overdue = '/requests/00000000-0000-4000-8000-000000000035';
    assert.equal((await request(overdue, cookies.student)).status, 404);
    const overduePage = await request(overdue, cookies.student2);
    assert.equal(overduePage.status, 200);
    assert.match(await overduePage.text(), /Срок ответа прошёл/);
    assert.match(await (await request('/requests/triage', cookies.dean)).text(), /Срок прошёл/);
    for (let i = 0; i < 32; i++) {
      assert.equal(
        (await request('/login', '', { email: 'unlisted@deka.test', password: 'unused' })).status,
        400
      );
    }
    assert.equal(
      (await request('/login', '', { email: 'student@deka.test', password: passwords.student }))
        .status,
      429
    );
  } finally {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (created) await db.query('DROP DATABASE "' + temporary + '" WITH (FORCE)');
    } finally {
      await db.end();
    }
  }
});
