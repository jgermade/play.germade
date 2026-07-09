#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET_TAR="$ROOT_DIR/public/assets/celeste/celeste-assets.tar.gz"
PATCHED_TAR="$ROOT_DIR/public/assets/celeste/celeste-assets.patched.tar.gz"

if [[ ! -f "$TARGET_TAR" ]]; then
  echo "Error: Base assets tar not found at $TARGET_TAR."
  echo "Please run package-celeste-assets.sh first."
  exit 1
fi

ARGS=""
for arg in "$@"; do
  if [[ "$arg" == "--everest" || "$arg" == "--visible" ]]; then
    ARGS="$ARGS $arg"
  fi
done

echo "Running WASM pre-patch via Playwright..."
cd "$ROOT_DIR"
node scripts/celeste/prepatch-wasm.mjs $ARGS

if [[ -d "$ROOT_DIR/.tmp/patched-opfs" ]]; then
  echo "Re-packaging patched assets to $PATCHED_TAR..."
  cd "$ROOT_DIR/.tmp/patched-opfs"
  rm -f "$PATCHED_TAR"
  tar -czf "$PATCHED_TAR" . > /dev/null
  cd "$ROOT_DIR"
  rm -rf "$ROOT_DIR/.tmp/patched-opfs"
  echo "Success! Assets patched and packaged to $PATCHED_TAR"
else
  echo "Error: Patched OPFS directory not found. Patching may have failed."
  exit 1
fi
