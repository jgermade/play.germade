#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_ZIP="$ROOT_DIR/public/game/celeste/assets.zip"
PATCHED_ZIP="$ROOT_DIR/public/game/celeste/assets.patched.zip"

if [[ ! -f "$TARGET_ZIP" ]]; then
  echo "Error: Base assets.zip not found at $TARGET_ZIP."
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
  echo "Re-packaging patched assets to $PATCHED_ZIP..."
  cd "$ROOT_DIR/.tmp/patched-opfs"
  rm -f "$PATCHED_ZIP"
  zip -r "$PATCHED_ZIP" . > /dev/null
  cd "$ROOT_DIR"
  rm -rf "$ROOT_DIR/.tmp/patched-opfs"
  echo "Success! Assets patched and packaged to $PATCHED_ZIP"
else
  echo "Error: Patched OPFS directory not found. Patching may have failed."
  exit 1
fi
