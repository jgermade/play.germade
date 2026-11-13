// The launcher's service worker: offline shell, engines cached on first play, and
// cross-origin isolation for static hosts that cannot send COOP/COEP themselves.
//
// It must be the only worker on the scope, which is why it also does what
// coi-serviceworker used to: one scope, one service worker.

import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

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

// Engines: their path is pinned per release (public/engines/<id>/ is replaced when the
// pinned version changes), so cache-first is safe and a game played once plays offline.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/engines/'),
  new CacheFirst({ cacheName: 'engines' }),
);

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

// ROM Manager's catalogue (scripts/fetch-datasets.mjs): served from the cache, refreshed
// behind it, so identification works offline and a new build's data arrives next time.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/datasets/'),
  new StaleWhileRevalidate({ cacheName: 'datasets' }),
);
