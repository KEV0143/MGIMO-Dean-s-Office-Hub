import assert from 'node:assert/strict';
import { cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';

const [address = 'http://127.0.0.1:5180', count = '480', mode = 'single'] = process.argv.slice(2);
const origin = new URL(address);
const total = Number(count);
assert.equal(origin.hostname, '127.0.0.1', 'Use a locally running synthetic demo.');
assert.ok(origin.origin === address && Number.isInteger(total) && total >= 96 && total <= 10000);

assert.ok(['single', 'student-cohorts'].includes(mode));
const simulatedCohort = mode === 'student-cohorts';
const levels = simulatedCohort ? [16, 32, 64] : [1, 8, 32];
const cookies = [];

async function authenticate(credentials) {
  const login = await fetch(new URL('/login', origin), {
    method: 'POST',
    headers: { accept: 'text/html', origin: origin.origin },
    body: new URLSearchParams(credentials),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000)
  });
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  assert.equal(login.status, 303, 'Local student login');
  assert.ok(cookie?.startsWith('deka_session='));
  await login.text();
  return cookie;
}

if (simulatedCohort) {
  for (let i = 0; i < levels.at(-1); i++) {
    const group = Math.floor(i / 20) + 1;
    const student = (i % 20) + 1;
    cookies.push(
      await authenticate({
        email: 'load-' + group + '-' + student + '@deka.test',
        password: 'Deka2026!'
      })
    );
  }
  assert.equal(new Set(cookies).size, levels.at(-1));
} else {
  cookies.push(await authenticate({ account: 'student' }));
}

const routes = ['/overview', '/schedule', '/grades', '/requests', '/notifications', '/profile'];
const rounded = (value) => Math.round(value * 100) / 100;
function quantile(values, percentile) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  return rounded(sorted[Math.ceil(sorted.length * percentile) - 1]);
}

async function read(route, cookie) {
  const start = performance.now();
  try {
    const response = await fetch(new URL(route, origin), {
      headers: { accept: 'text/html', cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    const bytes = (await response.arrayBuffer()).byteLength;
    return { route, status: response.status, bytes, ms: performance.now() - start };
  } catch (error) {
    return { route, status: 0, error: error.name, bytes: 0, ms: performance.now() - start };
  }
}
for (let round = 0; round < 5; round++) {
  const warm = await Promise.all(routes.map((route) => read(route, cookies[0])));
  assert.ok(
    warm.every((row) => row.status === 200),
    JSON.stringify(warm)
  );
}

function metrics(rows) {
  const success = rows.filter((row) => row.status === 200);
  return {
    n: rows.length,
    errors: rows.length - success.length,
    p50Ms: quantile(
      success.map((row) => row.ms),
      0.5
    ),
    p95Ms: quantile(
      success.map((row) => row.ms),
      0.95
    ),
    medianDecodedBytes: quantile(
      success.map((row) => row.bytes),
      0.5
    )
  };
}

const suites = [];
for (const concurrency of levels) {
  const results = [];
  let next = 0;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      while (next < total) {
        const route = routes[next++ % routes.length];
        results.push(await read(route, simulatedCohort ? cookies[worker] : cookies[0]));
      }
    })
  );
  const seconds = (performance.now() - start) / 1000;
  const summary = metrics(results);
  suites.push({
    concurrency,
    distinctStudentSessions: simulatedCohort ? concurrency : 1,
    ...summary,
    okResponsesPerSecond: rounded((total - summary.errors) / seconds),
    endpoints: Object.fromEntries(
      routes.map((route) => [route, metrics(results.filter((row) => row.route === route))])
    )
  });
}
console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      node: process.version,
      platform: platform(),
      cpu: cpus()[0]?.model,
      protocol: 'Loopback, authenticated SSR HTML, keep-alive, warm-up 5 requests per route',
      suites
    },
    null,
    2
  )
);
if (suites.some((suite) => suite.errors)) process.exitCode = 1;
