#!/usr/bin/env bash
set -euo pipefail

# Builds jgenesis-web (WASM) inside Docker and deploys to public/console/megadrive/.
#
# jgenesis is a multi-system emulator (Rust + wgpu/WebGPU + winit + AudioWorklet).
# This script:
#   1. Clones jsgroth/jgenesis into .tmp/jgenesis-build
#   2. Patches the Rust source to support loading ROMs from bytes (not just rfd file picker)
#   3. Builds with wasm-pack (nightly + build-std=panic_abort,std for SharedArrayBuffer)
#   4. Copies pkg/, js/, and our custom index.html to public/console/megadrive/
#   5. Generates per-console roms.<console>.json manifests from public/roms/

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/jgenesis-build"
SCRIPTS_DIR="$ROOT_DIR/scripts/jgenesis"
TARGET_DIR="$ROOT_DIR/public/console/jgenesis"
ROMS_DIR="$ROOT_DIR/public/roms"
DOCKERFILE="$SCRIPTS_DIR/docker/jgenesis-builder.Dockerfile"
IMAGE_TAG="jgenesis-builder:latest"

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"
mkdir -p "$ROMS_DIR"

echo "Cloning jsgroth/jgenesis..."
git clone --depth=1 https://github.com/jsgroth/jgenesis.git "$WORK_DIR"

echo "Patching jgenesis-web source for URL-based ROM loading..."
python3 "$SCRIPTS_DIR/patch-jgenesis-web.py" "$WORK_DIR/frontend/jgenesis-web"

echo "Building Docker image (Rust nightly + wasm-pack)..."
docker build -t "$IMAGE_TAG" -f "$DOCKERFILE" "$SCRIPTS_DIR/docker"

echo "Building jgenesis-web WASM via Docker..."
# wasm-pack needs a target dir inside the container; mount the whole jgenesis repo
# so workspace dependencies resolve. The build output goes to frontend/jgenesis-web/pkg/.
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace/frontend/jgenesis-web \
    "$IMAGE_TAG" \
    bash -c "rustup run nightly wasm-pack build --target web . -- -Z build-std=panic_abort,std"

echo "Copying build output (pkg/) to $TARGET_DIR..."
cp -R "$WORK_DIR/frontend/jgenesis-web/pkg/"* "$TARGET_DIR/"

echo "Copying JS helpers (audio-processor.js, idb.js, polyfill.js, ui.js) to $TARGET_DIR/js/..."
mkdir -p "$TARGET_DIR/js"
cp "$WORK_DIR/frontend/jgenesis-web/js/"*.js "$TARGET_DIR/js/"
sed -i.bak 's/\.\.\/pkg\/jgenesis_web\.js/\.\.\/jgenesis_web\.js/g' "$TARGET_DIR/js/audio-processor.js"
rm -f "$TARGET_DIR/js/audio-processor.js.bak"

echo "Copying custom index.html to $TARGET_DIR..."
cp "$SCRIPTS_DIR/index.html" "$TARGET_DIR/index.html"

echo "Generating per-console ROM manifests (roms.<console>.json)..."
python3 "$SCRIPTS_DIR/generate-roms-manifest.py" "$ROMS_DIR"

echo "Build complete. Output available in $TARGET_DIR"
echo "ROMs manifests available at $ROMS_DIR/roms.*.json"
