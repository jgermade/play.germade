#!/usr/bin/env bash
set -euo pipefail

# Builds Super Mario World (snesrev/smw) as WASM inside Docker and deploys to
# public/game/smario-world/.
#
# Game assets are extracted at build time from the user's ROM
# (game-assets/smario-world/smario-world-USA.sfc) into smw_assets.dat with
# --no-include-rom: the ROM itself is never shipped, and without an embedded
# ROM the engine runs in pure-C mode (RM_MINE), skipping the upstream
# per-frame SNES-emulator verification entirely.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/smw-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/smario-world"
TARGET_DIR="$ROOT_DIR/public/game/smario-world"
SCRIPTS_DIR="$ROOT_DIR/scripts/games/smario-world"

ROM_FILE="$ASSETS_DIR/smario-world-USA.sfc"
ROM_SHA1_EXPECTED="6b47bb75d16514b6a476aa0c73a683a2a4c18765" # SMW (USA), unheadered

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker
need_cmd python3

if [ ! -f "$ROM_FILE" ]; then
  echo "Error: ROM not found at $ROM_FILE" >&2
  exit 1
fi

ROM_SHA1="$(shasum "$ROM_FILE" | awk '{print $1}')"
if [ "$ROM_SHA1" != "$ROM_SHA1_EXPECTED" ]; then
  echo "Error: ROM sha1 mismatch ($ROM_SHA1); need the unheadered USA ROM" >&2
  exit 1
fi

echo "Setting up workspace (Super Mario World)..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$TARGET_DIR"

echo "Cloning snesrev/smw..."
git clone --depth=1 https://github.com/snesrev/smw.git "$WORK_DIR"

echo "Copying ROM (build-time only), smw.ini and Emscripten Makefile..."
cp "$ROM_FILE" "$WORK_DIR/smw.sfc"
cp "$SCRIPTS_DIR/smw.ini" "$WORK_DIR/smw.ini"
cp "$SCRIPTS_DIR/Makefile.emscripten" "$WORK_DIR/Makefile.emscripten"

echo "Patching src/main.c for Emscripten..."
python3 "$SCRIPTS_DIR/patch-smw-emscripten.py" "$WORK_DIR"

echo "Patching widescreen support (ExtendedAspectRatio)..."
python3 "$SCRIPTS_DIR/patch-smw-widescreen.py" "$WORK_DIR"

echo "Extracting assets + building WASM via Docker (emscripten/emsdk:latest)..."
docker run --rm \
  -v "$WORK_DIR:/workspace" \
  -w /workspace \
  emscripten/emsdk:latest \
  bash -c "python3 assets/restool.py --extract-from-rom -r /workspace/smw.sfc --no-include-rom && make -f Makefile.emscripten -j\$(nproc)"

echo "Removing build-time ROM copy..."
rm -f "$WORK_DIR/smw.sfc"

echo "Copying build output to $TARGET_DIR..."
cp -R "$WORK_DIR/wasm/"* "$TARGET_DIR/"
cp "$SCRIPTS_DIR/index.html" "$TARGET_DIR/index.html"

echo "Build complete. Output available in $TARGET_DIR"
