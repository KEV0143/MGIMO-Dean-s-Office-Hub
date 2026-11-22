import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type UserConfig } from 'vite';

export default defineConfig((): UserConfig => {
  const pagesBase = process.env.VITE_DEKA_PAGES_BASE;
  return {
    plugins: [
      !!pagesBase && {
        name: 'deka-browser-database',
        enforce: 'pre',
        resolveId(id) {
          if (id === '#server/database/postgres.ts') {
            return {
              id: new URL('./scripts/pages/database.mjs', import.meta.url).href,
              external: true
            };
          }
        }
      },
      sveltekit({
        preprocess: vitePreprocess(),
        adapter: adapter({ out: process.env.BUILD_DIRECTORY ?? '.output' }),
        csp: {
          mode: 'auto',
          directives: {
            'default-src': ['self'],
            'script-src': ['self'],
            'style-src': ['self', 'unsafe-inline'],
            'img-src': ['self', 'data:', 'blob:'],
            'object-src': ['none'],
            'base-uri': ['none'],
            'frame-ancestors': ['none'],
            'form-action': ['self']
          }
        },
        paths: {
          ...(pagesBase
            ? { base: pagesBase as `/${string}`, relative: false }
            : { origin: process.env.ORIGIN ?? 'http://127.0.0.1:5180' })
        },
        serviceWorker: { register: !pagesBase }
      })
    ],
    build: { target: 'es2022', sourcemap: false },
    // Keep inherited PostCSS configuration from changing the portal stylesheet.
    css: { postcss: {} }
  };
});
