import { server } from 'deka-pages:server';
import { query } from './database.mjs';

const base = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const ready = server.init({ env: {} });
const asset =
  /^(?:\/_app\/|\/fonts\/|\/brand\/|\/about\/|\/runtime\/|\/cabinet-worker\.js$|\/boot\.js$|\/index\.html$|\/manifest\.webmanifest$|\/(?:pglite\.(?:wasm|data)|initdb\.wasm)$)/;

function fromCabinet(value) {
  const url = URL.parse(value);
  return url?.origin === self.location.origin && url.pathname.startsWith(base + '/');
}

async function respond(event) {
  const { request } = event;
  try {
    await ready;
    const headers = new Headers(request.headers);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const client = event.clientId && (await self.clients.get(event.clientId));
      if (!fromCabinet(client?.url) && !fromCabinet(request.referrer)) {
        return new Response('Откройте кабинет и повторите действие.', { status: 403 });
      }
      // FetchEvent requests may omit Origin even for same-origin submissions.
      headers.set('origin', self.location.origin);
    }
    const { rows } = await query('SELECT token FROM pages_session WHERE id=true');
    const token = rows[0]?.token ?? null;
    const browserSession = { token };
    // The browser build supplies a local session through the adapter platform.
    // Response-created Set-Cookie headers are inaccessible to service workers.
    const localRequest = request.clone();
    Object.defineProperty(localRequest, 'headers', { value: headers });
    const response = await server.respond(localRequest, {
      getClientAddress: () => 'browser',
      platform: { browserSession }
    });
    if (browserSession.token !== token) {
      if (browserSession.token) {
        await query(
          'INSERT INTO pages_session VALUES (true, $1) ON CONFLICT (id) DO UPDATE SET token=EXCLUDED.token',
          [browserSession.token]
        );
      } else {
        await query('DELETE FROM pages_session WHERE id=true AND token=$1', [token]);
      }
    }
    return response;
  } catch (error) {
    console.error('Deka browser runtime failed', error);
    return new Response('Не удалось открыть кабинет. Перезагрузите страницу.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(base + '/')) return;
  if (asset.test(url.pathname.slice(base.length))) return;
  event.respondWith(respond(event));
});
