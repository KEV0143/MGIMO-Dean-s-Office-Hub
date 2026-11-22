import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = resolve(scripts, '../..');
const base = process.env.VITE_DEKA_PAGES_BASE ?? '/MGIMO-Dean-s-Office-Hub';
if (!/^\/[A-Za-z0-9_-]+$/.test(base)) throw new Error('Expected one GitHub Pages path segment.');

const work = join(root, '.local/pages');
const output = join(work, 'site');
const serverBuild = join(work, 'node');
const ps = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: root,
  env: {
    ...process.env,
    BUILD_DIRECTORY: serverBuild,
    VITE_DEKA_PAGES_BASE: base
  },
  stdio: 'inherit'
});
if (ps.status !== 0) throw ps.error ?? new Error('SvelteKit build failed.');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(serverBuild, 'client', base), output, {
  recursive: true,
  filter: (source) =>
    !/\.(?:br|gz)$/.test(source) &&
    !source.endsWith('/service-worker.js') &&
    !source.endsWith('\\service-worker.js')
});
await cp(join(root, 'site'), join(output, 'about'), { recursive: true });
await cp(join(scripts, 'boot.js'), join(output, 'boot.js'));

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
const livePortal = process.env.LIVE_PORTAL_URL?.trim() ?? '';
if (livePortal) {
  const live = new URL(livePortal);
  if (
    live.protocol !== 'https:' ||
    live.username ||
    live.password ||
    live.hostname.endsWith('.github.io')
  )
    throw new Error('LIVE_PORTAL_URL must be a separate HTTPS installation without credentials.');
}

const template = await readFile(join(scripts, 'index.html'), 'utf8');
const entry = template
  .replaceAll('__BASE__', base)
  .replace(
    '__LIVE_LINK__',
    livePortal
      ? '<p><a id="live" data-href="' +
          escapeHtml(livePortal) +
          '" href="' +
          escapeHtml(livePortal) +
          '">Войти в кабинет</a></p>'
      : ''
  );
await Promise.all([
  writeFile(join(output, 'index.html'), entry),
  writeFile(join(output, '404.html'), entry),
  writeFile(join(output, '.nojekyll'), '')
]);
const manifest = await readFile(join(output, 'manifest.webmanifest'), 'utf8');
await writeFile(join(output, 'manifest.webmanifest'), manifest.replaceAll('"/', '"' + base + '/'));

const about = join(output, 'about/index.html');
const repository = process.env.GITHUB_REPOSITORY ?? 'KEV0143/MGIMO-Dean-s-Office-Hub';
const github = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
const aboutPage = (await readFile(about, 'utf8'))
  .replace(
    'name="deka-repository" content=""',
    'name="deka-repository" content="' + escapeHtml(github + '/' + repository) + '"'
  )
  .replace(
    'name="deka-portal" content=""',
    'name="deka-portal" content="' + escapeHtml(livePortal || base + '/') + '"'
  );
await writeFile(about, aboutPage);

const directory = join(root, 'db/migrations');
const migrations = await Promise.all(
  (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map(async (name) => [name, await readFile(join(directory, name), 'utf8')])
);

await build({
  absWorkingDir: root,
  entryPoints: [join(scripts, 'worker.mjs')],
  outfile: join(output, 'cabinet-worker.js'),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  legalComments: 'linked',
  inject: [join(scripts, 'globals.mjs')],
  define: { 'process.env': '{}' },
  external: ['node:async_hooks', 'node:worker_threads', 'node:module'],
  plugins: [
    {
      name: 'deka-pages',
      setup(plugin) {
        const modules = {
          'deka-pages:server': join(serverBuild, 'server/server.js'),
          'node:crypto': join(scripts, 'crypto.mjs'),
          'node:util': join(scripts, 'util.mjs'),
          qrcode: join(scripts, 'qrcode.mjs')
        };
        plugin.onResolve(
          { filter: /^(?:deka-pages:server|node:crypto|node:util|qrcode)$/ },
          ({ path }) => ({ path: modules[path] })
        );
        const database = join(scripts, 'database.mjs');
        const databaseUrl = pathToFileURL(database).href;
        plugin.onResolve({ filter: /^file:/ }, ({ path }) =>
          path === databaseUrl ? { path: database } : null
        );
        plugin.onResolve({ filter: /^deka-pages:migrations$/ }, ({ path }) => ({
          path,
          namespace: 'deka-build'
        }));
        plugin.onLoad({ filter: /.*/, namespace: 'deka-build' }, () => ({
          contents: 'export const migrations = ' + JSON.stringify(migrations),
          loader: 'js'
        }));
      }
    }
  ]
});

const pglite = join(root, 'node_modules/@electric-sql/pglite/dist');
for (const file of ['pglite.wasm', 'initdb.wasm', 'pglite.data']) {
  await cp(join(pglite, file), join(output, file));
}
console.log('GitHub Pages cabinet built at ' + output);
