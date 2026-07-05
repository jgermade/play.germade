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
  - Build script: `scripts/sonic/build-sonic-docker.sh [1|2]` (generalized, accepts game number as argument).
  - Custom HTML shell (`scripts/sonic/index.html`, shared by both) with: fullscreen canvas, AudioContext resume, Gamepad→Keyboard translator.
  - Gamepad support is implemented as a JavaScript gamepad→keyboard translator (bypasses SDL2 gamepad, which is broken in Emscripten). Buttons A→Z, B→X, Start→Enter, D-pad/Stick→Arrow keys.
  - `Data.rsdk` and `settings.ini` (per-game, `scripts/sonic/settings-sonic-{1,2}.ini`) are loaded from `game-assets/sonic-{1,2}/`.
- Sonic 3 uses **Sonic 3 A.I.R.** (`Eukaryot/sonic3air`), consuming the upstream project's own official prebuilt Emscripten web release (GitHub release asset `sonic3air_web_data.zip`) rather than compiling the C++ engine from source.
  - Build script: `scripts/sonic3/build-sonic3-web.sh` — fetches latest release, validates the ROM (`game-assets/sonic-3/Sonic_Knuckles_wSonic3.bin`, must be exactly 4,194,304 bytes), deploys to `public/game/sonic-3/`.
  - Unlike RSDKv4 (ROM baked in at compile time via `--preload-file`), this engine loads its ROM at runtime into an Emscripten IDBFS filesystem. The build script patches the shipped `index.html` to auto-fetch the ROM from a same-origin `rom/` path and inject it via `FS_createDataFile`, avoiding the engine's native file-picker prompt.
  - Uses SDL2's standard Gamepad API bindings directly (no manual gamepad patch needed, unlike RSDKv4).

## Todos
- Implement hosted assets feature to bypass `showDirectoryPicker()` (In Progress, see `SESSIONS/2026-07-04_17h02.hosted-assets.session.md`).
- Redesign Launcher UI to Netflix style (Completed).
- Add Sonic 1 (Completed). ✅
- Add Sonic 2 — parametrize build script to `scripts/sonic/build-sonic-docker.sh` accepting game number as argument. (Completed) ✅
- Add Sonic 3 (A.I.R.), via upstream's official prebuilt web release. (Completed) ✅
- Add Quake and Doom games (WIP).
- Add an in-game overlay to return to the launcher without using the browser back button (In Progress, see `SESSIONS/2026-07-05_03h00.launcher-return-overlay.session.md`).
