#!/usr/bin/env bash
set -euo pipefail

# Builds Sonic 1 or Sonic 2 WASM inside Docker.
# Usage:
#   scripts/sonic/build-sonic-docker.sh [1|2]
#   Default: 1

SONIC_NUM="${1:-1}"

if [[ "$SONIC_NUM" != "1" && "$SONIC_NUM" != "2" ]]; then
    echo "Error: argument must be 1 or 2 (got: $SONIC_NUM)"
    exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic${SONIC_NUM}-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/sonic-${SONIC_NUM}"
TARGET_DIR="$ROOT_DIR/public/game/sonic-${SONIC_NUM}"
SETTINGS_FILE="$ROOT_DIR/scripts/sonic/settings-sonic-${SONIC_NUM}.ini"
SCRIPTS_DIR="$ROOT_DIR/scripts/sonic"

echo "Setting up workspace (Sonic ${SONIC_NUM})..."
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
cp "$SETTINGS_FILE" "$WORK_DIR/settings.ini"

echo "Patching Makefile to increase STACK_SIZE and change output to index.js..."
# Increase stack size to 5MB and total memory to 128MB to prevent Stack Overflow in InitUserdata
# Also output to index.js instead of index.html so we can provide our own custom index.html
sed -i.bak -e 's/-s TOTAL_MEMORY=60MB -s ALLOW_MEMORY_GROWTH=1/-s TOTAL_MEMORY=268435456 -s STACK_SIZE=5242880/g' -e 's/wasm\/index\.html/wasm\/index.js/g' -e 's/--preload-file Data.rsdk/--preload-file Data.rsdk --preload-file settings.ini/g' "$WORK_DIR/Makefile"

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

echo "Patching Input.cpp to forcibly initialize controllers continuously with fallback mapping..."
perl -0777 -pi -e 's/void ProcessInput\(\)\n\{/void ProcessInput()\n{\n#if RETRO_USING_SDL2\n    for (int i = 0; i < SDL_NumJoysticks(); ++i) {\n        if (!SDL_GameControllerFromInstanceID(i)) {\n            if (!SDL_IsGameController(i)) {\n                char mapping[1024];\n                SDL_JoystickGUID guid = SDL_JoystickGetDeviceGUID(i);\n                char guid_str[33];\n                SDL_JoystickGetGUIDString(guid, guid_str, sizeof(guid_str));\n                snprintf(mapping, sizeof(mapping), "%s,Web Gamepad,a:b0,b:b1,x:b2,y:b3,back:b8,start:b9,leftstick:b10,rightstick:b11,leftshoulder:b4,rightshoulder:b5,dpup:b12,dpdown:b13,dpleft:b14,dpright:b15,leftx:a0,lefty:a1,rightx:a2,righty:a3,lefttrigger:b6,righttrigger:b7,", guid_str);\n                SDL_GameControllerAddMapping(mapping);\n            }\n            controllerInit(i);\n        }\n    }\n#endif/g' "$WORK_DIR/RSDKv4/Input.cpp"

echo "Building WASM via Docker (emscripten/emsdk:latest)..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    make wasm

echo "Copying build output to $TARGET_DIR..."
cp -R "$WORK_DIR/wasm/"* "$TARGET_DIR/"

echo "Copying custom index.html to $TARGET_DIR..."
cp "$SCRIPTS_DIR/index.html" "$TARGET_DIR/index.html"

echo "Build complete. Output available in $TARGET_DIR"
