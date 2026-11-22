/// <reference lib="webworker" />
import { immutable, assets as staticFiles } from '$app/manifest';
import { version } from '$app/env';
const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `deka-static-${version}`;
const offline = '/offline.html';
const pathname = (file: { path: string }) => new URL(file.path, worker.location.href).pathname;
const allowed = new Set([
  ...immutable.map(pathname),
  ...staticFiles.map(pathname).filter((path) => /^\/(fonts|brand)\//.test(path))
]);
worker.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.add(offline)));
});
worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith('deka-static-') && name !== cacheName) await caches.delete(name);
      await worker.clients.claim();
    })()
  );
});
worker.addEventListener('fetch', (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== worker.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match(offline)) ??
          new Response('Нет подключения', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
      )
    );
  } else if (!url.search && allowed.has(url.pathname)) {
    const resource = (async () => {
      const cache = await caches.open(cacheName).catch(() => null);
      const hit = await cache?.match(url.pathname).catch(() => null);
      if (hit) return { response: hit };
      const response = await fetch(request);
      const saved =
        response.ok && !response.redirected
          ? cache?.put(url.pathname, response.clone()).catch(() => undefined)
          : undefined;
      return { response, saved };
    })();
    event.respondWith(resource.then(({ response }) => response));
    event.waitUntil(
      resource.then(
        ({ saved }) => saved,
        () => undefined
      )
    );
  }
});
