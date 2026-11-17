// The launcher's service worker: offline shell, engines cached on first play, and
// cross-origin isolation for static hosts that cannot send COOP/COEP themselves.
//
// It must be the only worker on the scope, which is why it also does what
// coi-serviceworker used to: one scope, one service worker.

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import engines from './lib/engines.json';

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const isolated = (response) => {
  if (!response || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(ISOLATION)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

// Navigations first (registered before Workbox's routes, so this respondWith wins):
// network when online so a deploy shows up, the precached shell when offline, and
// the isolation headers on both. Every route (/sonic1/, /megadrive/) has its own shell.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  // /sonic1/, /megadrive/?game=… → that route's own shell; anything else → the home.
  const route = /^\/([a-z0-9]+)\/?$/.exec(url.pathname)?.[1];
  event.respondWith(
    (async () => {
      try {
        return isolated(await fetch(request));
      } catch {
        const shell = (route && (await matchPrecache(`${route}/index.html`))) || (await matchPrecache('index.html'));
        return isolated(shell);
      }
    })(),
  );
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Engines: cached on first play, one cache per engine and version. Their paths do not
// carry the version (/engines/blastem/app/app.js is the same for every release), so the
// cache name does: a bump in engines.json changes this worker, and on activation the
// caches of versions no longer pinned are dropped, so that engine is fetched again.
const ENGINE_CACHES = new Map(
  Object.entries(engines)
    .filter(([id]) => !id.startsWith('$'))
    .map(([id, engine]) => [id, `engines-${id}@${engine.version}`]),
);

for (const [id, cacheName] of ENGINE_CACHES) {
  registerRoute(
    ({ url }) => url.origin === self.location.origin && url.pathname.startsWith(`/engines/${id}/`),
    new CacheFirst({ cacheName }),
  );
}

self.addEventListener('activate', (event) => {
  const current = new Set(ENGINE_CACHES.values());
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        // `engines` alone is the old shared cache, from before the version was in the name.
        if ((name === 'engines' || name.startsWith('engines-')) && !current.has(name)) await caches.delete(name);
      }
    })(),
  );
});

registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/covers/'),
  new CacheFirst({
    cacheName: 'covers',
    plugins: [new ExpirationPlugin({ maxEntries: 80 })],
  }),
);

// The page asks before the new version takes over (registerType: 'prompt').
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// /roms/ is rom-manager (public/roms/): its app, its chunks and roms-sdk.js are precached
// with the shell; its own datasets are read like the launcher's, from the cache first.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/roms/datasets/'),
  new StaleWhileRevalidate({ cacheName: 'roms-datasets' }),
);

// ROM Manager's catalogue (scripts/fetch-datasets.mjs): served from the cache, refreshed
// behind it, so identification works offline and a new build's data arrives next time.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/datasets/'),
  new StaleWhileRevalidate({ cacheName: 'datasets' }),
);
