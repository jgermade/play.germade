# play.germade.dev

A WebAssembly (WASM) games collection and launcher.

## Project Specs
- WebAssembly games launcher built with **Astro**.
- Games are organized in `src/data/games.ts` and pages are in `src/pages/game/[slug]/index.astro`.
- Styles live in `src/styles/main.css`.
- Celeste WASM engine uses `.NET 9 threaded WebAssembly` from upstream repo `MercuryWorkshop/celeste-wasm` (branch `threads-v2`).
- Celeste engine is built via Docker with `make build.celeste` and outputs to `public/game/celeste/build`.

## Todos
- Implement hosted assets feature to bypass `showDirectoryPicker()` (In Progress, see `SESSIONS/2026-07-04_17h02.hosted-assets.session.md`).
- Add Sonic games (WIP).
- Add Quake and Doom games (WIP).
