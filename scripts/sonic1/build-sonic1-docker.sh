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

echo "Copying Data.rsdk and settings.ini into build directory..."
cp "$ASSETS_DIR/Data.rsdk" "$WORK_DIR/Data.rsdk"
cp "$ASSETS_DIR/settings.ini" "$WORK_DIR/settings.ini"

echo "Patching Makefile to increase STACK_SIZE and change output to index.js..."
# Increase stack size to 5MB and total memory to 128MB to prevent Stack Overflow in InitUserdata
# Also output to index.js instead of index.html so we can provide our own custom index.html
sed -i.bak -e 's/-s TOTAL_MEMORY=60MB -s ALLOW_MEMORY_GROWTH=1/-s TOTAL_MEMORY=134217728 -s STACK_SIZE=5242880/g' -e 's/wasm\/index\.html/wasm\/index.js/g' -e 's/--preload-file Data.rsdk/--preload-file Data.rsdk --preload-file settings.ini/g' "$WORK_DIR/Makefile"

echo "Patching main.cpp to fix Emscripten initialization order..."
cat << 'EOF' > "$WORK_DIR/patch_main.cpp"
#include "RetroEngine.hpp"

#ifdef __EMSCRIPTEN__
#include "emscripten.h"

void main_loop()
{
    static bool init = false;
    if (!init) {
        Engine.Init();
        init = true;
    }
	Engine.Run();
}
#endif


int main(int argc, char *argv[])
{
    for (int i = 0; i < argc; ++i) {
        if (StrComp(argv[i], "UsingCWD"))
            usingCWD = true;
    }
    
    SDL_SetHint(SDL_HINT_WINRT_HANDLE_BACK_BUTTON, "1");
#ifdef __EMSCRIPTEN__
    SDL_Init(SDL_INIT_EVERYTHING);
	emscripten_set_main_loop(main_loop, 0, 1);
#else
    Engine.Init();
    Engine.Run();
#endif

    return 0;
}

#if RETRO_PLATFORM == RETRO_UWP
int __stdcall wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) { return SDL_WinRTRunApp(main, NULL); }
#endif
EOF
mv "$WORK_DIR/patch_main.cpp" "$WORK_DIR/RSDKv4/main.cpp"

echo "Patching Audio.cpp to initialize audio explicitly..."
sed -i.bak 's/if ((audioDevice = SDL_OpenAudioDevice/SDL_InitSubSystem(SDL_INIT_AUDIO); if ((audioDevice = SDL_OpenAudioDevice/' "$WORK_DIR/RSDKv4/Audio.cpp"

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
