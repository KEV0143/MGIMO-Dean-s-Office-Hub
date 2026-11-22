const status = document.querySelector('#status');
const liveLink = document.querySelector('#live');

async function openCabinet() {
  const host = liveLink?.dataset.href;
  if (host) {
    location.replace(host);
    return;
  }

  const base = document.querySelector('meta[name="deka-base"]').content;
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
  const workers = navigator.serviceWorker;
  if (!workers.controller) {
    await workers.register(base + '/cabinet-worker.js', { type: 'module' });
    if (!workers.controller) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Startup timeout')), 20000);
        workers.addEventListener(
          'controllerchange',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
    }
  }

  const requested = new URL(location.href);
  if (requested.pathname === base + '/index.html') requested.pathname = base + '/';
  location.replace(requested);
}

openCabinet().catch((error) => {
  console.error(error);
  status.textContent =
    'Кабинет не загрузился. Проверьте, что браузер разрешает хранение данных для этого сайта, и обновите страницу.';
});
