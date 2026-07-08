#!/usr/bin/env bash
set -euo pipefail

# Builds FBNeo WASM (standalone) inside Docker and deploys to public/console/neo-geo/
# Uses OkCyb0rg/fbneo-wasm-port

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/fbneo-wasm-build"
TARGET_DIR="$ROOT_DIR/public/console/neo-geo"
ROMS_DIR="$ROOT_DIR/public/roms/neo-geo"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker
need_cmd git

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$TARGET_DIR" "$ROMS_DIR"

echo "Cloning OkCyb0rg/fbneo-wasm-port..."
git clone --recursive --depth=1 https://github.com/OkCyb0rg/fbneo-wasm-port.git "$WORK_DIR"

echo "Using pre-compiled WASM from repository..."
# docker run --rm \
#   -v "$WORK_DIR:/workspace" \
#   -w /workspace/fbneo \
#   emscripten/emsdk:latest \
#   bash -c "make -f makefile.wasm -j\$(nproc)"

echo "Copying build output to $TARGET_DIR..."
# The build output fbneo-wasm.js and .wasm are placed in the root of the repo (WORK_DIR)
cp "$WORK_DIR/fbneo-wasm.js" "$TARGET_DIR/"
cp "$WORK_DIR/fbneo-wasm.wasm" "$TARGET_DIR/"
cp "$WORK_DIR/app.js" "$TARGET_DIR/"
cp "$WORK_DIR/audio-worklet.js" "$TARGET_DIR/"
cp "$WORK_DIR/driver-index.js" "$TARGET_DIR/"
cp "$WORK_DIR/index.html" "$TARGET_DIR/"
cp "$WORK_DIR/styles.css" "$TARGET_DIR/"

echo "Generating ROMs manifest..."
python3 "$ROOT_DIR/scripts/jgenesis/generate-roms-manifest.py" "$ROOT_DIR/public/roms"

echo "Build complete. Output available in $TARGET_DIR"
