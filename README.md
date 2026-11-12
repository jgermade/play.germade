# play.germade

A Netflix-style launcher for the [wasm-gaming](https://github.com/wasm-gaming) engines:
modern retro games and emulators running in the browser, installable as a PWA.

The launcher is a **pure consumer**. It builds no engine and has no per-engine page: every
engine is an independent repo implementing
[`@wasm-gaming/engine-specs`](https://github.com/wasm-gaming/engine-specs), and one generic
player drives all of them.

```bash
make up                 # dev server (fetches the pinned engines first) → http://localhost:5173
make build && make preview
make test
```

To run against a local engine build instead of its release:

```bash
ENGINE_SRC_RSDKV4=../rsdkv4-wasm/dist/rsdkv4 make up
```

## Project Specs

- **UI with jq79 + Vite** (see [STACK.md](STACK.md)): `src/App.html` (hero + category rows,
  keyboard and gamepad navigation), `src/components/` (`Hero`, `InstallDialog`, `Notice`),
  `src/services/` (`storage`, `library`, `input`).
- **Categories** (`src/data/catalog.js`): *Retro moderno* (decompiled/ported games: RSDK,
  Celeste…) and *Emuladores* (systems, each with its own ROM library). A game is a data entry
  with `engine`, `kind`, `status` and the files it `install`s — never a page.
- **Engines** pinned in `src/data/engines.json`, fetched from GitHub Releases at build time
  (`scripts/fetch-engines.mjs`), served same-origin from `/engines/<id>/`. The npm packages carry
  the SDK but not the wasm; the release asset carries both.
- **Storage** — OPFS `<engine-id>/<slug>/`: the engine owns `<engine-id>/`, the launcher passes
  the slug as `storage.namespace`. *Install* writes the game's files there once; *Play* hands
  them to the engine as thunks that read them back; saves land beside them. Uninstall removes
  the data and keeps the saves. Persistent storage is requested on first install.
- **Player** — `/play/?game=<slug>` in a full-screen iframe: imports the engine SDK, then
  `new SDK({ config }).assets().storage({ namespace: slug }).mount().start()`. Escape (or
  Select+Start) opens the pause menu: continue / restart / back to the catalog, which destroys
  the engine and drops the iframe — safe for engines that cannot restart in process.
- **PWA** — installable (fullscreen, landscape), offline catalog, engines cached on first play,
  updates offered with a prompt (never mid-game). The service worker adds COOP/COEP to every
  navigation, so threaded engines get `crossOriginIsolated` on any static host; one reload on the
  very first visit.
- **Legacy** — the first proof of concept (Astro, per-game pages, engine build scripts) lives in
  [legacy/](legacy/) for reference until each engine is migrated. It is not part of the build.

## Todos

- [ ] Release `rsdkv4-wasm` 0.3.0 (pinned in `engines.json`; until then use `ENGINE_SRC_RSDKV4`).
- [ ] Emulators: per-system ROM list organised by game (versions grouped, as in ROM Manager),
      version picker, ROM-hacking patches (IPS/BPS/UPS) applied on the fly while loading.
- [ ] Gamepad inside games (engines that only read the keyboard need a mapping).
- [ ] Settings panel painted from each engine's `config()` / `options()` descriptors.
- [ ] Migrate engines in priority order: rsdkv3 → rsdkv5 → fbneo → blastem → jgenesis → celeste.
- [ ] Sonic 3 A.I.R. and Super Mario World: decide on engine repos (see SESSIONS).
- [ ] Deploy target and CI (build + Pages).

See [SESSIONS/](SESSIONS/) for the decisions behind all of this.
