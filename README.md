# play.germade.dev

A WebAssembly (WASM) games collection and launcher.

## Project Specs
- WebAssembly games launcher built with **Astro**.
- Games are organized in `src/data/games.ts` and pages are in `src/pages/game/[slug]/index.astro`.
- Styles live in `src/styles/main.css`.
- Celeste WASM engine uses `.NET 9 threaded WebAssembly` from upstream repo `MercuryWorkshop/celeste-wasm` (branch `threads-v2`).
- Celeste engine is built via Docker with `make build.celeste` and outputs to `public/game/celeste/build`.
- Scripts are organized inside `scripts/celeste/`.
- Gamepad proxy (`patch-gamepad-proxy.mjs`) is applied post-build to support controllers in Emscripten web workers.
- Console-style Launcher UI with horizontal and vertical grid navigation, keyboard and gamepad support, and in-place OPFS asset extraction.
- Sonic 1 & 2 use **RSDKv4** (Rubberduckycooly decompilation) compiled to WASM via Emscripten inside Docker.
  - Build script: `scripts/sonic1/build-sonic1-docker.sh` (to be generalized to `scripts/sonic/build-sonic-docker.sh`).
  - Custom HTML shell (`scripts/sonic1/index.html`) with: fullscreen canvas, AudioContext resume, Gamepad→Keyboard translator.
  - Gamepad support is implemented as a JavaScript gamepad→keyboard translator (bypasses SDL2 gamepad, which is broken in Emscripten). Buttons A→Z, B→X, Start→Enter, D-pad/Stick→Arrow keys.
  - `Data.rsdk` and `settings.ini` are loaded from `game-assets/sonic-{1,2}/`.

## Todos
- Implement hosted assets feature to bypass `showDirectoryPicker()` (In Progress, see `SESSIONS/2026-07-04_17h02.hosted-assets.session.md`).
- Redesign Launcher UI to Netflix style (Completed).
- Add Sonic 1 (Completed). ✅
- Add Sonic 2 — parametrize build script to `scripts/sonic/build-sonic-docker.sh` accepting game number as argument. (Completed) ✅
- Add Quake and Doom games (WIP).
