# Project: play.germade.dev

## Overview
A WebAssembly (WASM) games collection and launcher.

## Structure
```
.
├── index.html          # Game launcher/portal
├── scripts/main.js     # Game data and launcher logic
├── styles/main.css     # Shared styles
└── game/               # Per-game folders
    └── <game-slug>/
        └── index.html  # Game entry point
```

## Games
| Slug          | Title                   | Status |
|---------------|-------------------------|--------|
| celeste       | Celeste/Everest         | READY  |
| sonic-1       | Sonic The Hedgehog      | WIP    |
| sonic-2       | Sonic The Hedgehog 2    | WIP    |
| sonic-3       | Sonic The Hedgehog 3    | WIP    |
| sonic-mania   | Sonic Mania             | WIP    |
| quake         | Quake (Qwasm)           | WIP    |
| quake-2       | Quake II (Qwasm2)       | WIP    |
| doom          | Doom (Dwasm)            | WIP    |

## Celeste Build Source
- Upstream repository: https://github.com/MercuryWorkshop/celeste-wasm
- Upstream branch used in this project: `threads-v2`
- Local integration target: `game/celeste/build`

### Build Celeste Locally
1. Ensure dependencies are available in your machine environment:
    - `git`
    - `make`
    - `pnpm`
    - `.NET SDK` (upstream currently publishes from net10 targets)
    - `mono-devel` (required by upstream)
2. Run:
    - `scripts/build-celeste.sh`
3. Open `game/celeste/index.html` through the launcher.

The build script clones or updates upstream, runs `make publish`, and syncs `frontend/dist` into `game/celeste/build`.

### Build Celeste With Docker
1. Ensure Docker is installed and running.
2. Run:
    - `scripts/build-celeste-docker.sh`
3. Open `game/celeste/index.html` through the launcher.

Docker build notes:
- Uses `scripts/docker/celeste-builder.Dockerfile`.
- Runs the same integration script (`scripts/build-celeste.sh`) inside the container.
- Output is still synced to `game/celeste/build` in this repository.

### Celeste Original Files Checklist (Runtime)
The browser port does not ship Celeste proprietary assets. You must provide your own game files from a legal install.

Required folder structure in selected Celeste directory:
1. `Content/`
2. `Content/Dialog/`
3. `Content/Effects/`
4. `Content/FMOD/`
5. `Content/Graphics/`
6. `Content/Maps/`
7. `Content/Monocle/`
8. `Content/Overworld/`
9. `Content/Tutorials/`

Required game binary:
1. `Celeste.exe` at the root of the selected directory
2. Also accepted: `orig/Celeste.exe` (common in Everest installs)

Optional Everest runtime files (if you enable Everest patching):
1. `Celeste/Everest/Celeste.Mod.mm.dll`
2. `Celeste/Everest/MMHOOK_Celeste.dll`

Typical Steam install locations:
1. macOS: `~/Library/Application Support/Steam/steamapps/common/Celeste/Celeste.app/Contents/Resources`
2. Linux: `~/.steam/root/steamapps/common/Celeste`
3. Windows: `C:\Program Files (x86)\Steam\steamapps\common\Celeste`

How this maps to this repository:
1. Build output (web app): `game/celeste/build`
2. Launcher page: `game/celeste/index.html`
3. When `game/celeste/build` is loaded in-browser, Celeste files are imported by selecting your local Celeste folder from the setup UI.
