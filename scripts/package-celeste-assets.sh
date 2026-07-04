#!/usr/bin/env bash
set -euo pipefail

# This script packages a local Celeste Steam installation into a zip file
# that can be hosted on the server and loaded automatically by the browser.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ZIP="$ROOT_DIR/public/game/celeste/assets.zip"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <path_to_celeste_steam_directory>"
  echo "Example: $0 '~/Library/Application Support/Steam/steamapps/common/Celeste/Celeste.app/Contents/Resources'"
  exit 1
fi

CELESTE_DIR="$1"

if [[ ! -d "$CELESTE_DIR" ]]; then
  echo "Error: Directory not found: $CELESTE_DIR"
  exit 1
fi

if [[ ! -d "$CELESTE_DIR/Content" ]]; then
  echo "Error: 'Content' directory not found inside $CELESTE_DIR"
  exit 1
fi

# Find Celeste.exe (could be in root or orig/)
CELESTE_EXE=""
if [[ -f "$CELESTE_DIR/Celeste.exe" ]]; then
  CELESTE_EXE="Celeste.exe"
elif [[ -f "$CELESTE_DIR/orig/Celeste.exe" ]]; then
  CELESTE_EXE="orig/Celeste.exe"
else
  echo "Error: 'Celeste.exe' not found in root or orig/ directory."
  exit 1
fi

echo "Packaging Celeste assets from: $CELESTE_DIR"
echo "Target: $TARGET_ZIP"

# Create a temporary directory for zipping
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Copying files to temporary directory..."
cp -r "$CELESTE_DIR/Content" "$TMP_DIR/Content"
cp "$CELESTE_DIR/$CELESTE_EXE" "$TMP_DIR/Celeste.exe"

# Optional Everest files
if [[ -d "$CELESTE_DIR/Everest" ]]; then
  cp -r "$CELESTE_DIR/Everest" "$TMP_DIR/Everest" 2>/dev/null || true
fi

echo "Creating zip archive (this may take a while)..."
mkdir -p "$(dirname "$TARGET_ZIP")"
cd "$TMP_DIR"
zip -r "$TARGET_ZIP" Content Celeste.exe > /dev/null

echo "Success! Assets packaged to $TARGET_ZIP"
