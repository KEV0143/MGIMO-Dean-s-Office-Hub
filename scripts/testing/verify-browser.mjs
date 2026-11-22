import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const origin = process.env.TEST_ORIGIN;
const chrome = process.env.DEKA_CHROME_PATH;
if (origin !== 'http://127.0.0.1:5182' || !chrome) {
  throw new Error('Run browser verification via the isolated test runner with DEKA_CHROME_PATH.');
}
const output = fileURLToPath(new URL('../../.local/reports/browser/', import.meta.url));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'chrome-'));
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
);
let browserError;
browser.on('error', (caught) => {
  browserError = caught;
});
let socket;
const pending = new Map();
let requestId = 0;
const results = [];
const errors = [];
const accessibility = [];
const mobilePerformance = [];
const axePath = process.env.DEKA_AXE_PATH;
const axe = axePath ? await readFile(axePath, 'utf8') : null;

async function until(check, description) {
  for (let tries = 0; tries < 100; tries++) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      if (!/execution context|context with specified id/i.test(error.message)) throw error;
    }
    await delay(100);
  }
  throw new Error('Timed out: ' + description);
}
function send(method, params = {}) {
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('DevTools timed out: ' + method));
    }, 10000);
    pending.set(id, (reply) => {
      clearTimeout(timer);
      if (reply.error) reject(new Error(method + ': ' + reply.error.message));
      else resolve(reply.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const reply = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text + ': ' + expression);
  return reply.result.value;
}
async function accessibilityCheck(route) {
  if (!axe) return;
  await evaluate(axe + '\nvoid 0');
  const result = await evaluate(`axe.run(document, {runOnly: {type: 'tag', values: [
    'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'
  ]}}).then(({ violations }) => violations.map(({ id, impact, nodes }) => ({
    id, impact, targets: nodes.map(({ target, failureSummary }) => ({target, failureSummary}))
  })))`);
  accessibility.push({ route, violations: result });
}
const exists = (selector) => evaluate('!!document.querySelector(' + JSON.stringify(selector) + ')');
const pathname = () => evaluate('location.pathname');
async function visit(route, selector) {
  const destination = new URL(route, origin);
  const previousDocument = await evaluate('performance.timeOrigin');
  await send('Page.navigate', { url: destination.href });
  await until(
    async () =>
      (await evaluate('performance.timeOrigin')) !== previousDocument &&
      (await evaluate('location.href')) === destination.href &&
      (await evaluate('document.readyState === "complete"')) &&
      (await exists(selector)),
    route
  );
  await evaluate('document.fonts.ready.then(() => true)');
}
async function tap(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  assert.ok(point, selector);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function layout(name, width, screenshot = false, student = !name.endsWith('-login')) {
  await evaluate('document.fonts.ready.then(() => true)');
  const metrics = await evaluate(`({
    width: window.innerWidth,
    layoutWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    landmarks: document.querySelectorAll('main').length,
    quickNav: document.querySelector('.mobile-student-nav') ? getComputedStyle(document.querySelector('.mobile-student-nav')).display : null,
    heading: document.querySelector('h1')?.textContent
  })`);
  assert.equal(metrics.width, width, name);
  assert.ok(
    metrics.scrollWidth <= metrics.layoutWidth + 1,
    name + ' overflows horizontally: ' + JSON.stringify(metrics)
  );
  assert.equal(metrics.landmarks, 1, name);
  assert.equal(metrics.quickNav, student ? (width <= 800 ? 'grid' : 'none') : null, name);
  results.push({ name, ...metrics });
  if (screenshot) {
    await delay(240); // Let Chromium finish painting the touch highlight.
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
  }
}

try {
  const port = await until(async () => {
    if (browserError) throw browserError;
    if (browser.exitCode !== null) throw new Error('Chrome exited with code ' + browser.exitCode);
    try {
      return (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0];
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }, 'Chrome debugging port');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', ({ data }) => {
    const reply = JSON.parse(data);
    if (reply.id) {
      pending.get(reply.id)?.(reply);
      pending.delete(reply.id);
    } else if (reply.method === 'Runtime.exceptionThrown') {
      errors.push(
        reply.params.exceptionDetails.exception?.description ?? reply.params.exceptionDetails.text
      );
    }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      window.dekaPerformance = {lcp: null, cls: 0};
      new PerformanceObserver((list) => {
        window.dekaPerformance.lcp = list.getEntries().at(-1)?.startTime ?? null;
      }).observe({type: 'largest-contentful-paint', buffered: true});
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput)
          window.dekaPerformance.cls += entry.value;
      }).observe({type: 'layout-shift', buffered: true});
    })()`
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 940,
    deviceScaleFactor: 1,
    mobile: false
  });
  await visit('/login', 'form:has(input[value="student"]) button');
  await layout('desktop-login', 1440, true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await layout('mobile-login', 390, true);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 1,
    mobile: true
  });
  await layout('contest-login', 360);
  await accessibilityCheck('/login');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 940,
    deviceScaleFactor: 1,
    mobile: false
  });
  assert.match(
    await evaluate(
      'document.querySelector(\'form:has(input[value="student"]) button\').textContent'
    ),
    /Перенос пары и маршрут/
  );
  assert.equal(await evaluate('document.querySelector(".password-entry").open'), false);
  assert.equal(await exists('.copyright, .update'), false);
  await evaluate('document.querySelector(\'form:has(input[value="student"]) button\').click()');
  await until(
    async () => (await pathname()) === '/overview' && (await exists('.next-lesson')),
    'student quick login'
  );
  assert.equal(await exists('.page-footer, .version, .update'), false);
  await layout('desktop-overview', 1440, true);
  for (const route of ['/grades', '/schedule', '/profile']) {
    await visit(route, 'h1');
    await layout('desktop-' + route.slice(1), 1440, true);
  }
  await visit('/campus?from=314&to=404', '#steps-heading');
  await layout('desktop-campus', 1440, true);

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await visit('/overview', '.next-lesson');
  await layout('mobile-overview', 390, true);
  await tap('.next-lesson a.lesson-secondary');
  await until(
    async () =>
      (await pathname()) === '/schedule' &&
      (await evaluate('!!location.hash && !!document.querySelector(location.hash + ".linked")')),
    'next lesson opens the selected schedule day'
  );
  await visit('/overview', '#today-actions');
  await tap('section:has(#today-actions) a:has(.action-text)');
  await until(
    async () =>
      (await pathname()) === '/schedule' &&
      (await evaluate(
        '!!location.hash && !!document.querySelector(location.hash + ".linked .lesson-change")'
      )),
    'changed lesson opens and highlights the right schedule card'
  );
  const movedHash = await evaluate('location.hash');
  await send('Page.navigate', { url: origin + '/schedule?date=2000-01-01' + movedHash });
  await until(
    () =>
      evaluate(
        'location.search.startsWith("?lesson=") && !!document.querySelector(location.hash + ".linked")'
      ),
    'old schedule bookmark resolves to the current lesson'
  );
  await layout('mobile-schedule-change', 390, true);
  await tap('.linked .moved-directions');
  await until(
    async () => (await pathname()) === '/campus' && (await exists('#steps-heading')),
    'rescheduled lesson opens an indoor route from the previous classroom'
  );
  await layout('mobile-schedule-route', 390, true);
  await visit('/overview', '.next-lesson');
  await tap('.mobile-student-nav a[href="/schedule"]');
  await until(
    async () => (await pathname()) === '/schedule' && (await exists('.days button')),
    'mobile schedule'
  );
  if (await exists('.days button:not([aria-pressed="true"])')) {
    const next = await evaluate(
      `document.querySelector('.days button:not([aria-pressed="true"])').getAttribute('aria-label')`
    );
    await tap('.days button[aria-label=' + JSON.stringify(next) + ']');
    await until(
      () => exists('.days button[aria-label=' + JSON.stringify(next) + '][aria-pressed="true"]'),
      'switch schedule day'
    );
  }
  // The upcoming classes have numbered rooms. A past lab may have a free-text location.
  await visit('/schedule', '.days');
  let roomLink = false;
  for (let week = 0; week < 3 && !roomLink; week++) {
    if (week > 0) await tap('.week-navigation button[aria-label="Следующая неделя"]');
    const days = await evaluate(
      'Array.from(document.querySelectorAll(\'.days button[data-has-lessons="true"]\'), button => button.getAttribute("aria-label"))'
    );
    for (const label of days) {
      await tap('.days button[aria-label=' + JSON.stringify(label) + ']');
      if (await exists('.room-link')) {
        roomLink = true;
        break;
      }
    }
  }
  assert.ok(roomLink, 'classroom link on a teaching day');
  await layout('mobile-schedule', 390, true);
  await tap('.room-link');
  await until(
    async () => (await pathname()) === '/campus' && (await exists('.official-plan-link')),
    'route from a class'
  );
  await visit('/campus', '.planner');
  await tap('input[name="from"]');
  await send('Input.insertText', { text: '314' });
  await until(() => exists('#places-from option'), 'room autocomplete');
  await tap('input[name="to"]');
  await send('Input.insertText', { text: '404' });
  await tap('.planner button[type="submit"]');
  await until(() => exists('#steps-heading'), 'build route from room numbers');
  assert.ok(await exists('.official-room-link[href$="room=n314"]'));
  await tap('.editor summary');
  await tap('input[name="mode"]');
  await tap('.planner button[type="submit"]');
  await until(
    () =>
      evaluate(
        'location.search.includes("mode=lift") && document.querySelector(".directions")?.textContent.includes("Лифт")'
      ),
    'campus lift route'
  );
  await tap('.floors a[aria-label="4 этаж"]');
  await until(
    () => exists('.floors a[aria-label="4 этаж"][aria-current="page"]'),
    'show destination floor'
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".official-plan-link").href === "https://mgimo.ru/territory/map/?building=n&floor=4"'
    )
  );
  assert.ok(await exists('.official-room-link[href$="room=n404"]'));
  await evaluate('window.scrollTo(0, document.querySelector(".plan-card").offsetTop - 10)');
  await layout('mobile-campus', 390, true);
  await tap('.account[href="/profile"]');
  await until(
    async () => (await pathname()) === '/profile' && (await exists('#profile-services')),
    'profile from the header'
  );
  await layout('mobile-profile', 390, true);
  await tap('.services-jump');
  await until(() => evaluate('location.hash === "#profile-services"'), 'profile services shortcut');
  await layout('mobile-services', 390, true);
  await tap('main a[href="/student-card"]');
  await until(
    async () => (await pathname()) === '/student-card' && (await exists('main img')),
    'student QR'
  );
  await layout('mobile-student-card', 390);
  await visit('/requests/00000000-0000-4000-8000-000000000030', '#request-conversation textarea');
  await tap('#request-message');
  const message = 'Проверка с телефона: когда можно забрать документ?';
  await send('Input.insertText', { text: message });
  await tap('#request-conversation button');
  await until(
    () =>
      evaluate(
        `document.querySelector('#request-conversation ol')?.textContent.includes(${JSON.stringify(message)})`
      ),
    'send a request message'
  );
  await evaluate('document.querySelector("#request-conversation").scrollIntoView()');
  await layout('mobile-conversation', 390, true);
  await visit('/grades', '.grade-search');
  await tap('.grade-search');
  await send('Input.insertText', { text: 'Базы данных' });
  await until(
    () =>
      evaluate(
        'document.querySelectorAll(".data-table tbody tr").length === 1 && document.querySelector(".data-table tbody").textContent.includes("Базы данных")'
      ),
    'filter grades'
  );
  await layout('mobile-grades', 390, true);

  await send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 1,
    mobile: true
  });
  for (const route of [
    '/overview',
    '/schedule',
    '/grades',
    '/requests',
    '/requests/new',
    '/notifications',
    '/profile'
  ]) {
    await visit(route, 'h1');
    await layout('contest-' + route.slice(1).replaceAll('/', '-'), 360, route === '/requests/new');
    await accessibilityCheck(route);
  }
  await visit('/requests/new', 'textarea[name="details"]');
  await tap('textarea[name="details"]');
  await send('Input.insertText', { text: 'Демонстрация подачи с телефона' });
  await tap('form.form-grid button.btn');
  await until(
    () =>
      evaluate(
        '/^\\/requests\\/[a-f0-9-]{36}$/.test(location.pathname) && document.body.textContent.includes("Демонстрация подачи с телефона")'
      ),
    'create and open a request from a 360px phone'
  );
  await layout('contest-request-status', 360, true);

  await visit('/assistant', '.suggestions button');
  await tap('.suggestions button');
  await until(
    () => exists('.draft-link[href="/requests/templates?type=study"]'),
    'assistant draft link'
  );
  await layout('mobile-assistant-draft', 360, true);
  await tap('.draft-link');
  await until(
    async () =>
      (await pathname()) === '/requests/templates' &&
      (await evaluate(
        'document.querySelector("textarea[name=details]")?.value.includes("Справка")'
      )),
    'editable request draft'
  );

  await send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true
  });
  for (const route of [
    '/overview',
    '/schedule',
    '/grades',
    '/requests',
    '/profile',
    '/assistant',
    '/campus'
  ]) {
    await visit(route, 'h1');
    await layout('narrow-' + route.slice(1), 320);
  }
  const logoutButton = '#app-sidebar form[action="/logout"] button';
  async function leaveAccount() {
    await tap('#mobile-menu-toggle');
    await until(
      () =>
        evaluate('document.querySelector("#app-sidebar.open")?.getBoundingClientRect().left === 0'),
      'sidebar open'
    );
    await tap(logoutButton);
    await until(async () => (await pathname()) === '/login', 'leave account by touch');
  }
  await leaveAccount();
  await tap('.account-group:nth-of-type(2) summary');
  await tap('form:has(input[value="dean"]) button');
  await until(async () => (await pathname()) === '/overview', 'staff sign-in by touch');
  await visit('/requests/triage', '.metrics');
  await layout('narrow-dean-queue', 320, true, false);
  await accessibilityCheck('/requests/triage');
  await visit('/requests/00000000-0000-4000-8000-000000000030', '#request-conversation');
  await evaluate('document.querySelector("#request-conversation").scrollIntoView()');
  await leaveAccount();
  await tap('form:has(input[value="student"]) button');
  await until(async () => (await pathname()) === '/overview', 'return to student account');

  if (process.env.DEKA_MOBILE_BENCHMARK === 'true') {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 780,
      deviceScaleFactor: 1,
      mobile: true
    });
    await send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: 200000,
      uploadThroughput: 93750
    });
    for (let run = 1; run <= 5; run++) {
      for (const route of ['/overview', '/schedule']) {
        await visit(route, 'h1');
        await until(() => evaluate('window.dekaPerformance.lcp'), 'LCP for ' + route);
        const measures = await evaluate(`(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          return {
            ...window.dekaPerformance,
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
            ttfb: navigation.responseStart,
            transferBytes: [navigation, ...performance.getEntriesByType('resource')]
              .reduce((total, resource) => total + resource.transferSize, 0)
          };
        })()`);
        mobilePerformance.push({ run, route, ...measures });
      }
    }
  }
  assert.deepEqual(errors, [], 'Unhandled browser errors');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(
      { browser: version.Browser, results, errors, accessibility, mobilePerformance },
      null,
      2
    )
  );
  assert.deepEqual(
    accessibility.filter(({ violations }) => violations.length),
    [],
    'Automated axe violations'
  );
  console.log(
    'Browser verification passed at 1440px, 390px, 360px and 320px, with student login, navigation, QR, request creation and messaging.'
  );
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      const state = await evaluate(
        `({ path: location.pathname, heading: document.querySelector('h1')?.textContent, status: document.querySelector('[role="alert"]')?.textContent })`
      );
      console.error('Browser state:', JSON.stringify(state), 'Runtime errors:', errors);
      const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(path.join(output, 'failure.png'), Buffer.from(data, 'base64'));
    } catch {}
  }
  throw error;
} finally {
  socket?.close();
  if (browser.pid && browser.exitCode === null && browser.signalCode === null) {
    const closed = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await closed;
  }
  if (
    path.dirname(profile) === path.resolve(output) &&
    path.basename(profile).startsWith('chrome-')
  )
    await rm(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
