# Celeste Integration Guide

## Source
- Upstream repo: https://github.com/MercuryWorkshop/celeste-wasm
- Upstream branch used here: threads-v2
- Local target in this project: public/game/celeste/build

## Build Options

### Local Build
Requirements:
1. git
2. make
3. pnpm
4. .NET SDK (9.x or 10.x)
5. mono-devel

Run:
1. scripts/build-celeste.sh

Result:
- Syncs frontend/dist from celeste-wasm into public/game/celeste/build

### Docker Build
Requirements:
1. Docker running

Run:
1. scripts/build-celeste-docker.sh

Notes:
1. Uses scripts/docker/celeste-builder.Dockerfile
2. Runs scripts/build-celeste.sh inside the container
3. Writes output to public/game/celeste/build

## Original Game Files Required
This browser port does not ship Celeste proprietary assets.
You must provide your own files from a legal install.

### Required structure in selected Celeste folder
1. Content/
2. Content/Dialog/
3. Content/Effects/
4. Content/FMOD/
5. Content/Graphics/
6. Content/Maps/
7. Content/Monocle/
8. Content/Overworld/
9. Content/Tutorials/

### Required binary
1. Celeste.exe at folder root
2. Also accepted: orig/Celeste.exe

### Optional files for Everest mode
1. Celeste/Everest/Celeste.Mod.mm.dll
2. Celeste/Everest/MMHOOK_Celeste.dll

## Common Steam Install Paths
1. macOS: ~/Library/Application Support/Steam/steamapps/common/Celeste/Celeste.app/Contents/Resources
2. Linux: ~/.steam/root/steamapps/common/Celeste
3. Windows: C:\Program Files (x86)\Steam\steamapps\common\Celeste

## Mapping to this repo
1. Launcher runtime page: src/pages/game/celeste/index.astro
2. Runtime build output: public/game/celeste/build
3. At runtime, users import local Celeste files from the setup UI in the browser
