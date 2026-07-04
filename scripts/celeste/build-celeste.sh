#!/usr/bin/env bash
set -euo pipefail

# Builds MercuryWorkshop/celeste-wasm and syncs output into this project.
# Usage:
#   scripts/build-celeste.sh
# Optional env vars:
#   CELESTE_WASM_DIR=/absolute/path/to/local/celeste-wasm clone
#   CELESTE_WASM_BRANCH=threads-v2

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="${CELESTE_WASM_BRANCH:-threads-v2}"
CLONE_DIR="${CELESTE_WASM_DIR:-$ROOT_DIR/.cache/celeste-wasm}"
TARGET_DIR="$ROOT_DIR/public/game/celeste"
UPSTREAM_MAKE_TARGET="publish"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    if [[ "$(uname -s)" == "Darwin" ]]; then
      case "$1" in
        dotnet)
          echo "Install hint (macOS): brew install --cask dotnet-sdk" >&2
          ;;
        mono)
          echo "Install hint (macOS): brew install mono" >&2
          ;;
      esac
    fi
    exit 1
  fi
}

check_dotnet_sdk() {
  if ! dotnet --list-sdks 2>/dev/null | grep -Eq '^(10\.|9\.)'; then
    echo "No compatible .NET SDK detected (expected 9.x or 10.x)." >&2
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "Install hint (macOS): brew install --cask dotnet-sdk" >&2
    fi
    exit 1
  fi
}

check_node_version() {
  local required_major=22
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"

  if (( node_major < required_major )); then
    echo "Node.js ${required_major}+ is required (detected: $(node -v 2>/dev/null || echo unknown))." >&2
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "Install hint (macOS): brew install node@22" >&2
    fi
    exit 1
  fi
}

need_cmd git
need_cmd make
need_cmd node
need_cmd pnpm
need_cmd dotnet
need_cmd mono
need_cmd rsync
check_dotnet_sdk
check_node_version

mkdir -p "$ROOT_DIR/.cache"

if [[ ! -d "$CLONE_DIR/.git" ]]; then
  echo "Cloning celeste-wasm into $CLONE_DIR"
  git clone --branch "$BRANCH" --single-branch https://github.com/MercuryWorkshop/celeste-wasm "$CLONE_DIR"
else
  echo "Updating celeste-wasm in $CLONE_DIR"
  git -C "$CLONE_DIR" fetch origin "$BRANCH"
  git -C "$CLONE_DIR" checkout "$BRANCH"
  git -C "$CLONE_DIR" pull --ff-only origin "$BRANCH"
fi

# The upstream project requires system dependencies (pnpm, dotnet, mono-devel).
echo "Restoring .NET workloads for celeste-wasm loader..."
if ! (cd "$CLONE_DIR/loader" && DOTNET_SKIP_WORKLOAD_MANIFEST_UPDATE=1 dotnet workload restore); then
  echo "dotnet workload restore failed; attempting explicit wasm-tools install..."
  (cd "$CLONE_DIR/loader" && DOTNET_SKIP_WORKLOAD_MANIFEST_UPDATE=1 dotnet workload install wasm-tools)
fi

echo "Running upstream publish build (make ${UPSTREAM_MAKE_TARGET})..."
make -C "$CLONE_DIR" "$UPSTREAM_MAKE_TARGET"

if [[ ! -f "$CLONE_DIR/frontend/dist/index.html" ]]; then
  echo "Build completed but frontend/dist/index.html was not found." >&2
  echo "Check upstream build logs in $CLONE_DIR." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
rsync -a --delete --exclude 'assets*.zip' "$CLONE_DIR/frontend/dist/" "$TARGET_DIR/"
mv "$TARGET_DIR/index.html" "$TARGET_DIR/game.html"

echo "Running Gamepad SAB Proxy patcher..."
node "$ROOT_DIR/scripts/celeste/patch-gamepad-proxy.mjs"

echo "Celeste build synced to: $TARGET_DIR"
