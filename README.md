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
- Sonic Mania uses **RSDKv5U** (Rubberduckycooly decompilation) compiled to WASM via Emscripten inside Docker (`scripts/sonic-mania/build-sonic-mania-docker.sh`).
  - Function-pointer signature mismatches in `GameLink.h`/`CPZBoss`/`GHZCutsceneK` are patched at build time instead of using `-sEMULATE_FUNCTION_POINTER_CASTS` (which taxed every indirect call in the engine's hottest path); link stage runs with `-O3`. Result: no `call_indirect` traps and a 23% smaller `.wasm`.
- Sonic CD uses **RSDKv3** (Rubberduckycooly's `Sonic-CD-11-Decompilation`) compiled to WASM via Emscripten inside Docker (`scripts/sonic-cd/build-sonic-cd-docker.sh`), with a script-generated Emscripten build (no upstream WASM fork exists for RSDKv3).
  - `libtheora` and `tinyxml2` are vendored by the build script; FMVs are skipped (engine falls back gracefully without `videos/`).
  - OpenGL is fully disabled for Emscripten (`RETRO_USING_OPENGL=0`): RSDKv3 uses its software rasterizer into an SDL2 texture, avoiding Emscripten `LEGACY_GL_EMULATION` bugs; `ALLOW_MEMORY_GROWTH` is off to dodge a resizable-ArrayBuffer crash on newer V8.
- All game wrappers support a `?rAF=60fps` debug URL flag that polyfills `requestAnimationFrame` with a 60fps `setTimeout` loop (bypasses VSync; for perf testing/QA, not normal play).
- Shared game-input script (`public/shared/game-input.js`, loaded synchronously *before* the engine script): AudioContext autoplay unlock, gamepad→keyboard translator with per-engine key-map presets (`window.__gamepadKeyMap = 'rsdkv4' | 'rsdkv5'` or a custom map object), and the SDL2 gamepad proxy (`mapping: "standard"` + synthetic `gamepadconnected`). Wired into Sonic 1/2 (`rsdkv4`) and Sonic Mania (`rsdkv5`), replacing the formerly-inline duplicated copies in each game's `index.html`.
- Shared cross-game overlay script (`public/shared/launcher-overlay.js`, served at `/shared/launcher-overlay.js`): a Cmd+Enter/Alt+Enter shortcut to toggle native browser fullscreen (always), plus a way back to `/` — either a persistent corner button + gamepad long-press (default, e.g. Celeste when wired), or (`window.__launcherReturnViaEscMenu = true`) a minimal Escape-triggered mini-menu with gamepad Select+Start as an Escape alias, for games with no in-game menu of their own (Sonic 3). Games with their own richer return option (Sonic 1/2's Dev Menu) set `window.__hideLauncherReturnButton = true` instead. Wired into Sonic 1/2 and Sonic 3; Celeste still pending.
- Sonic 1 & 2 replace RSDKv4's native Escape-triggered Dev Menu with an HTML overlay (`scripts/sonic/index.html`):
  - `RSDKv4/WebDevMenu.cpp` (generated by `build-sonic-docker.sh`) exposes `web_devmenu_get_stage_list()`, `web_devmenu_load_stage()` and `web_devmenu_set_paused()` via Emscripten embind (build already uses `--bind`).
  - Escape is intercepted client-side (capture phase) so the native menu never opens; F1/F2/F3/F10/F12/Backspace were left native at first, but since fixing the boot bug below required `DevMenu=false`, those are now fully replaced by the web menu.
  - The web menu pre-selects a "Return to Launcher" entry, pauses the engine (`Engine.masterPaused`) while open, and gamepad Select+Start held together is an alias for Escape (toggles the menu; suppressed from also reaching the game as raw Select/Start presses).
  - `settings-sonic-{1,2}.ini`: `DevMenu=false` (was `true`, which — for reasons not fully root-caused in RSDKv4 source, only empirically confirmed — caused a native menu-like screen to appear at boot) plus `StartingCategory=0`/`StartingScene=0`/`StartingPlayer=0` so boot skips this fork's custom "Start Menu" front-end and goes straight to the classic SEGA logo → TITLE SCREEN sequence.

## Todos
- Implement hosted assets feature to bypass `showDirectoryPicker()` (In Progress, see `SESSIONS/2026-07-04_17h02.hosted-assets.session.md`).
- Redesign Launcher UI to Netflix style (Completed).
- Add Sonic 1 (Completed). ✅
- Add Sonic 2 — parametrize build script to `scripts/sonic/build-sonic-docker.sh` accepting game number as argument. (Completed) ✅
- Add Sonic 3 (A.I.R.), via upstream's official prebuilt web release. (Completed) ✅
- Add Quake and Doom games (WIP).
- Add an in-game overlay to return to the launcher without using the browser back button, plus a web replacement for RSDKv4's Dev Menu (Sonic 1 & 2). (Completed) ✅
- Wire `/shared/launcher-overlay.js` into Sonic 3 (Completed) ✅ — Celeste deferred to a future session.
- Add Sonic Mania (Completed) ✅ — integration, music streaming, WASM perf (fpcast removal) and gamepad support (see `SESSIONS/2026-07-05_*.session.md`).
- Add Sonic CD (Completed) ✅ — RSDKv3 WASM build, software renderer, `?rAF=60fps` debug flag (see `SESSIONS/2026-07-05_21h00.sonic-cd-integration.session.md`).
- Add Super Mario World with wide-snes-style widescreen (In Progress, see `SESSIONS/2026-07-05_23h56.smw-widescreen-integration.session.md`) — Phase 1: 4:3 base integration; Phase 2: flexible `ExtendedAspectRatio` (default 16:9).
