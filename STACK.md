# Stack

- **UI:** [jq79](https://github.com/jgermade/jq79) single-file `.html` components, from npm (pinned), bundled by **Vite** with `jq79/vite`.
- **PWA:** `vite-plugin-pwa` (`injectManifest`), own service worker in `src/sw.js` (Workbox): precached shell, engines and covers cached on first use, COOP/COEP added to navigations.
- **Engines:** the wasm-gaming engines, each an independent repo implementing `@wasm-gaming/engine-specs`. Pinned in `src/data/engines.json`, fetched from each engine's GitHub Release into `public/engines/<id>/` by `scripts/fetch-engines.mjs`. Never built here.
- **Storage:** OPFS. Each engine owns `<engine-id>/`; the launcher uses the game slug as namespace → `<engine-id>/<slug>/` holds the installed data and the saves.
- **Player:** `/play/?game=<slug>` in an iframe — one page for every engine.
- **Tests:** `node --test tests/` (catalog integrity).
