#!/usr/bin/env bash
set -euo pipefail

# This script packages a local Celeste Steam installation into a zip file
# that can be hosted on the server and loaded automatically by the browser.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_TAR="$ROOT_DIR/public/assets/celeste/celeste-assets.tar.gz"

DEFAULT_DIR=""
if [[ "$(uname -s)" == "Darwin" ]]; then
  DEFAULT_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Celeste/Celeste.app/Contents/Resources"
elif [[ "$(uname -s)" == "Linux" ]]; then
  # Steam can also be a flatpak, but this is the most common path
  DEFAULT_DIR="$HOME/.local/share/Steam/steamapps/common/Celeste"
elif [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == CYGWIN* ]] || [[ "$(uname -s)" == MSYS* ]]; then
  DEFAULT_DIR="/c/Program Files (x86)/Steam/steamapps/common/Celeste"
fi

CELESTE_DIR=""
if [[ $# -eq 0 ]]; then
  if [[ -n "$DEFAULT_DIR" ]]; then
    read -p "No path provided. Use default path ($DEFAULT_DIR)? [Y/n] " confirm
    if [[ -z "$confirm" ]] || [[ "$confirm" == [yY] || "$confirm" == [yY][eE][sS] ]]; then
      CELESTE_DIR="$DEFAULT_DIR"
    else
      echo "Operation cancelled."
      echo "Usage: $0 <path_to_celeste_steam_directory>"
      exit 1
    fi
  else
    echo "Usage: $0 <path_to_celeste_steam_directory>"
    exit 1
  fi
else
  CELESTE_DIR="$1"
fi

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
echo "Target: $TARGET_TAR"

# Create a temporary directory for zipping
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Copying files to temporary directory..."
cp -r "$CELESTE_DIR/Content" "$TMP_DIR/Content"
cp "$CELESTE_DIR/$CELESTE_EXE" "$TMP_DIR/Celeste.exe"

if [[ -f "$CELESTE_DIR/orig/Celeste.exe" ]]; then
  echo "Everest already installed locally. Copying extra files..."
  if [[ -d "$CELESTE_DIR/Everest" ]]; then
    cp -r "$CELESTE_DIR/Everest" "$TMP_DIR/Everest" 2>/dev/null || true
  fi
  if [[ -d "$CELESTE_DIR/Mods" ]]; then
    cp -r "$CELESTE_DIR/Mods" "$TMP_DIR/Mods" 2>/dev/null || true
  fi
  if [[ -d "$CELESTE_DIR/Saves" ]]; then
    cp -r "$CELESTE_DIR/Saves" "$TMP_DIR/Saves" 2>/dev/null || true
  fi
fi

echo "Creating tar.gz archive (this may take a while)..."
mkdir -p "$(dirname "$TARGET_TAR")"
cd "$TMP_DIR"
tar -czf "$TARGET_TAR" . > /dev/null

echo "Success! Assets packaged to $TARGET_TAR"
