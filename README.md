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
ENGINE_SPECS_SRC=../engine-specs/dist ENGINE_SRC_RSDKV4=../rsdkv4-wasm/dist/rsdkv4 make up
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
- **Routes** — one page per catalog entry, generated at build time (`scripts/routes-plugin.mjs`):
  games on their own path (`/sonic1/`), systems on theirs with the game in the query
  (`/megadrive/?game=old-towers&version=ca2c05c0[&patch=…]`); `/megadrive/` alone is the library.
  A route installs what is missing, then mounts the **engine's app** (`EngineApp` from engine-specs)
  or, until the engine ships one, the launcher's generic app (pause menu: Continue / Restart / Back).
  Leaving returns through history (bfcache keeps the home as it was) or to `/?focus=<slug>`.
  Cross-document **View Transitions**: the tile's art morphs into the route's splash.
- **Input** — `createInput()` from `@wasm-gaming/engine-specs` (UX.md there): the same buttons
  everywhere; in game only Select+Start / Escape reach the menu.
- **PWA** — installable (fullscreen, landscape), offline catalog, engines cached on first play,
  updates offered with a prompt (never mid-game). The service worker adds COOP/COEP to every
  navigation, so threaded engines get `crossOriginIsolated` on any static host; one reload on the
  very first visit.
- **ROM libraries** (emulators) — ROMs belong to the system, saves to the engine:
  `library/<system>/roms/<sha1>.<ext>` + `library/<system>/index.json` (games → versions, chosen
  core). Import from the drawer (pick or drop, `.zip` opened in the browser), header-based
  identification groups versions of one game (`src/data/systems/mega-drive.js`); the drawer opens
  like an iOS 6 folder with a version badge per game; Enter plays the newest, Y/V lists versions.
  Core: the game's choice → the console's → the catalog default. Saves in `<engine>/<gameId>/`.
- **Legacy** — the first proof of concept (Astro, per-game pages, engine build scripts) lives in
  [legacy/](legacy/) for reference until each engine is migrated. It is not part of the build.

## Todos

- [ ] Release engine-specs 0.4.0 and depend on `^0.4.0` (until then `ENGINE_SPECS_SRC`).
- [ ] Release `rsdkv4-wasm` 0.3.0 (pinned in `engines.json`; until then use `ENGINE_SRC_RSDKV4`).
- [x] Emulators: per-system ROM library (Mega Drive), versions grouped by game, version picker,
      core per console and per game.
- [ ] ROM-hacking patches (IPS/BPS/UPS) applied on the fly while loading.
- [ ] DAT matching (No-Intro) instead of the header heuristic, shared with ROM Manager.
- [ ] Release `blastem-wasm` 0.2.0 (pinned in `engines.json`; until then `ENGINE_SRC_BLASTEM`).
- [ ] Gamepad inside games (engines that only read the keyboard need a mapping).
- [ ] Settings panel painted from each engine's `config()` / `options()` descriptors.
- [ ] Migrate engines in priority order: rsdkv3 → rsdkv5 → fbneo → blastem → jgenesis → celeste.
- [ ] Sonic 3 A.I.R. and Super Mario World: decide on engine repos (see RECORD/).
- [ ] Deploy target and CI (build + Pages).

See [RECORD/](RECORD/) for the decisions behind all of this.
