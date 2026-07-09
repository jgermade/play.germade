#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/blastem-build"
SCRIPTS_DIR="$ROOT_DIR/scripts/consoles/megadrive"
TARGET_DIR="$ROOT_DIR/public/console/shared/blastem"

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"

echo "Building BlastEm WASM via Docker..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    bash -c "
      echo 'Installing mercurial and wget...'
      apt-get update -qq && apt-get install -y mercurial wget -qq
      echo 'Cloning BlastEm...'
      hg clone https://www.retrodev.com/repos/blastem/ .
      echo 'Patching Makefile...'
      sed -i 's/-Werror=pointer-arith//g' Makefile
      sed -i 's/-Werror=implicit-function-declaration//g' Makefile
      echo 'CFLAGS += -Wno-incompatible-pointer-types -Wno-implicit-function-declaration' >> Makefile
      echo 'Downloading a valid TTF font for BlastEm UI...'
      wget -q https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf -O DroidSans.ttf
      echo 'Running emmake...'
      emmake make CPU=wasm
      echo 'Done building.'
    "

echo "Copying artifacts to target directory..."
cp "$WORK_DIR"/blastem.js "$ROOT_DIR/public/console/shared/blastem/"
cp "$WORK_DIR"/blastem.wasm "$ROOT_DIR/public/console/shared/blastem/"

echo "-----------------------------------"
echo "Build completed successfully!"
