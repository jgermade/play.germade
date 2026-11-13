// One page per catalog entry: /sonic1/, /megadrive/… (the owner's routes).
//
// The pages are generated from the catalog into routes/<slug>/index.html (gitignored),
// built as their own Vite entries, and emitted as /<slug>/index.html so a static host
// (GitHub Pages) serves them without rewrites. In dev, /<slug>/ is rewritten to the
// generated file.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GAMES } from '../src/data/catalog.js';

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const page = (entry) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#07080c" />
  <title>${esc(entry.title)} · play.germade</title>
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/src/route/route.css" />
  <script>
    // View transitions are progressive: when the browser skips one, its promises
    // reject. Nothing depends on them; acknowledge them before the first render.
    for (const type of ['pageswap', 'pagereveal']) addEventListener(type, (e) => {
      const t = e.viewTransition;
      if (t) for (const p of [t.ready, t.finished, t.updateCallbackDone]) p && p.catch(() => {});
    });
  </script>
</head>
<body data-slug="${esc(entry.slug)}" style="--accent: ${esc(entry.accent ?? '#334155')}">
  <main id="route"></main>
  <script type="module" src="/src/route/main.js"></script>
</body>
</html>
`;

export function routesPlugin() {
  let root;
  let dir;
  return {
    name: 'play-germade-routes',
    enforce: 'post', // after Vite's HTML plugin has emitted the pages
    config(config) {
      root = resolve(config.root ?? process.cwd());
      dir = join(root, 'routes');
      rmSync(dir, { recursive: true, force: true });
      const input = {};
      for (const entry of GAMES) {
        mkdirSync(join(dir, entry.slug), { recursive: true });
        const file = join(dir, entry.slug, 'index.html');
        writeFileSync(file, page(entry));
        input[`route-${entry.slug}`] = file;
      }
      return { build: { rollupOptions: { input } } };
    },
    configureServer(server) {
      const slugs = new Set(GAMES.map((g) => g.slug));
      server.middlewares.use((req, _res, next) => {
        const match = /^\/([a-z0-9]+)\/?(\?.*)?$/.exec(req.url ?? '');
        if (match && slugs.has(match[1])) req.url = `/routes/${match[1]}/index.html${match[2] ?? ''}`;
        next();
      });
    },
    generateBundle(_options, bundle) {
      // routes/<slug>/index.html → <slug>/index.html
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && asset.fileName.startsWith('routes/')) {
          asset.fileName = asset.fileName.slice('routes/'.length);
        }
      }
    },
  };
}
