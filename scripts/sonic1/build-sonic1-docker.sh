#!/usr/bin/env bash
set -euo pipefail

# Builds Sonic 1 WASM inside Docker and syncs output into public/game/sonic-1/build.
# Usage:
#   scripts/sonic1/build-sonic1-docker.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic1-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/sonic-1"
TARGET_DIR="$ROOT_DIR/public/game/sonic-1"

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"

echo "Cloning Sonic-Decompilation-WASM repository..."
git clone --depth=1 https://github.com/mattConn/Sonic-Decompilation-WASM.git "$WORK_DIR"

if [ ! -f "$ASSETS_DIR/Data.rsdk" ]; then
    echo "Error: Data.rsdk not found in $ASSETS_DIR"
    exit 1
fi

echo "Copying Data.rsdk into build directory..."
cp "$ASSETS_DIR/Data.rsdk" "$WORK_DIR/Data.rsdk"

echo "Patching Makefile to increase STACK_SIZE and change output to index.js..."
# Increase stack size to 5MB and total memory to 128MB to prevent Stack Overflow in InitUserdata
# Also output to index.js instead of index.html so we can provide our own custom index.html
sed -i.bak -e 's/-s TOTAL_MEMORY=60MB -s ALLOW_MEMORY_GROWTH=1/-s TOTAL_MEMORY=134217728 -s STACK_SIZE=5242880/g' -e 's/wasm\/index\.html/wasm\/index.js/g' "$WORK_DIR/Makefile"

echo "Building WASM via Docker (emscripten/emsdk:latest)..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    make wasm

echo "Copying build output to $TARGET_DIR..."
cp -R "$WORK_DIR/wasm/"* "$TARGET_DIR/"

echo "Copying custom index.html to $TARGET_DIR..."
cp "$ROOT_DIR/scripts/sonic1/index.html" "$TARGET_DIR/index.html"

echo "Build complete. Output available in $TARGET_DIR"
