#!/usr/bin/env bash
set -euo pipefail

# Builds Celeste WASM inside Docker and syncs output into game/celeste/build.
# Usage:
#   scripts/celeste/build-celeste-docker.sh
# Optional env vars:
#   CELESTE_WASM_BRANCH=threads-v2
#   CELESTE_DOCKER_IMAGE=play-germade/celeste-builder:latest

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="${CELESTE_WASM_BRANCH:-threads-v2}"
IMAGE_NAME="${CELESTE_DOCKER_IMAGE:-play-germade/celeste-builder:latest}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd docker

echo "Building Docker image: $IMAGE_NAME"
docker build \
  -f "$ROOT_DIR/scripts/celeste/docker/celeste-builder.Dockerfile" \
  -t "$IMAGE_NAME" \
  "$ROOT_DIR"

echo "Running Celeste build inside container"
docker run --rm \
  -v "$ROOT_DIR:/workspace" \
  -e CELESTE_WASM_BRANCH="$BRANCH" \
  -e CELESTE_WASM_DIR="/workspace/.cache/celeste-wasm" \
  "$IMAGE_NAME" \
  "cd /workspace && ./scripts/celeste/build-celeste.sh"

echo "Docker build completed. Output is in game/celeste/build"
