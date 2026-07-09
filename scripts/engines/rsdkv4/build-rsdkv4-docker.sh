#!/usr/bin/env bash
set -euo pipefail

# Builds Sonic 1 or Sonic 2 WASM inside Docker.
# Usage:
#   scripts/engines/rsdkv4/build-rsdkv4-docker.sh [sonic-1|sonic-2]
#   Default: sonic-1

GAME_SLUG="${1:-sonic-1}"

if [[ "$GAME_SLUG" != "sonic-1" && "$GAME_SLUG" != "sonic-2" ]]; then
    echo "Error: argument must be sonic-1 or sonic-2 (got: $GAME_SLUG)"
    exit 1
fi

SONIC_NUM="${GAME_SLUG#sonic-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic${SONIC_NUM}-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/${GAME_SLUG}"
TARGET_DIR="$ROOT_DIR/public/game/${GAME_SLUG}"
SETTINGS_FILE="$ROOT_DIR/scripts/games/${GAME_SLUG}/settings-sonic-${SONIC_NUM}.ini"
SCRIPTS_DIR="$ROOT_DIR/scripts/games/${GAME_SLUG}"

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

echo "Adding WebDevMenu.cpp (web replacement for the native Escape dev menu)..."
cat << 'EOF' > "$WORK_DIR/RSDKv4/WebDevMenu.cpp"
// Bridges a subset of RSDKv4's native Dev Menu (normally opened via Escape,
// see RetroEngine.cpp's SDLK_ESCAPE handler and Debug.cpp's initDevMenu())
// to JS, so the web shell can replace the in-canvas menu screen with an
// HTML overlay. Only stage browsing/loading is exposed here; F1/F2/F3/F10/F12/
// Backspace remain native, untouched, raw hotkeys (still gated by DevMenu=true
// in settings.ini).
#include "RetroEngine.hpp"
#include <emscripten/bind.h>
#include <sstream>

namespace {
std::string jsonEscape(const char *s)
{
    std::string out;
    for (const char *p = s; *p; ++p) {
        if (*p == '"' || *p == '\\')
            out += '\\';
        out += *p;
    }
    return out;
}
}

std::string web_devmenu_get_stage_list()
{
    std::ostringstream json;
    json << "[";
    for (int list = 0; list < STAGELIST_MAX; ++list) {
        if (list > 0)
            json << ",";
        json << "{\"name\":\"" << jsonEscape(stageListNames[list]) << "\",\"stages\":[";
        for (int i = 0; i < stageListCount[list]; ++i) {
            if (i > 0)
                json << ",";
            json << "{\"name\":\"" << jsonEscape(stageList[list][i].name) << "\"}";
        }
        json << "]}";
    }
    json << "]";
    return json.str();
}

void web_devmenu_load_stage(int listIdx, int stageIdx)
{
    if (listIdx < 0 || listIdx >= STAGELIST_MAX)
        return;
    if (stageIdx < 0 || stageIdx >= stageListCount[listIdx])
        return;

    // Mirrors the native F2/F3 hotkey handler and the DEVMENU_STAGELISTSEL
    // selection handler in Debug.cpp, so behavior stays identical.
    activeStageList   = listIdx;
    stageListPosition = stageIdx;
    stageMode         = STAGEMODE_LOAD;
    Engine.gameMode   = ENGINE_MAINGAME;
    SetGlobalVariableByName("options.gameMode", 0);
    SetGlobalVariableByName("lampPostID", 0); // For S1
    SetGlobalVariableByName("starPostID", 0); // For S2
}

void web_devmenu_set_paused(bool paused)
{
    // Same flag F12/Pause toggle natively (masterPaused): freezes
    // ProcessNativeObjects()/FlipScreen() in the main loop, so the game
    // stays frozen behind the HTML overlay while it's open.
    Engine.masterPaused = paused;
}

EMSCRIPTEN_BINDINGS(web_devmenu)
{
    emscripten::function("web_devmenu_get_stage_list", &web_devmenu_get_stage_list);
    emscripten::function("web_devmenu_load_stage", &web_devmenu_load_stage);
    emscripten::function("web_devmenu_set_paused", &web_devmenu_set_paused);
}
EOF

echo "Registering WebDevMenu.cpp in the Makefile SOURCES list..."
python3 - "$WORK_DIR/Makefile" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

anchor = "          RSDKv4/Userdata.cpp      \\\n"
assert content.count(anchor) == 1, "expected exactly one Userdata.cpp SOURCES line"
content = content.replace(anchor, anchor + "          RSDKv4/WebDevMenu.cpp   \\\n", 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

echo "Patching RetroEngine.cpp to use decoupled logic for 120Hz/30Hz..."
python3 - "$WORK_DIR/RSDKv4/RetroEngine.cpp" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

anchor = (
    "void RetroEngine::Run()\n"
    "{\n"
    "    uint frameStart, frameEnd = SDL_GetTicks();\n"
    "    float frameDelta = 0.0f;\n"
    "\n"
    "#ifndef __EMSCRIPTEN__\n"
    "    while (running) \n"
    "#endif\n"
    "    {\n"
)
replacement = (
    "void RetroEngine::Run()\n"
    "{\n"
    "#ifndef __EMSCRIPTEN__\n"
    "    uint frameStart, frameEnd = SDL_GetTicks();\n"
    "    float frameDelta = 0.0f;\n"
    "    while (running) \n"
    "#else\n"
    "    static unsigned long long curTicks = 0;\n"
    "    static unsigned long long prevTicks = 0;\n"
    "    unsigned long long targetFreq = SDL_GetPerformanceFrequency() / refreshRate;\n"
    "    if (running)\n"
    "#endif\n"
    "    {\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "        running = processEvents();\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "        for (int s = 0; s < gameSpeed; ++s) {\n"
    "            ProcessInput();\n"
    "#endif\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "            if (!masterPaused || frameStep) {\n"
    "#endif\n"
    "                ProcessNativeObjects();\n"
    "                FlipScreen();\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "#if RETRO_USING_OPENGL && RETRO_USING_SDL2 && RETRO_HARDWARE_RENDER\n"
    "                if (s == gameSpeed - 1)\n"
    "                    SDL_GL_SwapWindow(Engine.window);\n"
    "#endif\n"
    "                frameStep = false;\n"
    "            }\n"
    "        }\n"
    "#endif\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "        running = processEvents();\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "        for (int s = 0; s < gameSpeed; ++s) {\n"
    "            ProcessInput();\n"
    "#endif\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "            if (!masterPaused || frameStep) {\n"
    "#endif\n"
    "                ProcessNativeObjects();\n"
    "                FlipScreen();\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "#if RETRO_USING_OPENGL && RETRO_USING_SDL2 && RETRO_HARDWARE_RENDER\n"
    "                if (s == gameSpeed - 1)\n"
    "                    SDL_GL_SwapWindow(Engine.window);\n"
    "#endif\n"
    "                frameStep = false;\n"
    "            }\n"
    "        }\n"
    "#endif\n"
    "#else\n"
    "        int logicLoops = 0;\n"
    "        while (curTicks >= targetFreq && logicLoops < 4) {\n"
    "            curTicks -= targetFreq;\n"
    "            logicLoops++;\n"
    "            running = processEvents();\n"
    "            for (int s = 0; s < gameSpeed; ++s) {\n"
    "                ProcessInput();\n"
    "                if (!masterPaused || frameStep) {\n"
    "                    ProcessNativeObjects();\n"
    "                    frameStep = false;\n"
    "                }\n"
    "            }\n"
    "        }\n"
    "        FlipScreen();\n"
    "#endif\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "        frameStart = SDL_GetTicks();\n"
    "        frameDelta = frameStart - frameEnd;\n"
    "\n"
    "        if (frameDelta < 1000.0f / (float)refreshRate)\n"
    "            SDL_Delay(1000.0f / (float)refreshRate - frameDelta);\n"
    "\n"
    "        frameEnd = SDL_GetTicks();\n"
    "#endif\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "        frameStart = SDL_GetTicks();\n"
    "        frameDelta = frameStart - frameEnd;\n"
    "\n"
    "        if (frameDelta < 1000.0f / (float)refreshRate)\n"
    "            SDL_Delay(1000.0f / (float)refreshRate - frameDelta);\n"
    "\n"
    "        frameEnd = SDL_GetTicks();\n"
    "#endif\n"
    "#else\n"
    "        unsigned long long curTime = SDL_GetPerformanceCounter();\n"
    "        if (prevTicks == 0) prevTicks = curTime;\n"
    "        curTicks += (curTime - prevTicks);\n"
    "        prevTicks = curTime;\n"
    "        if (curTicks > targetFreq * 4) curTicks = targetFreq * 4;\n"
    "        if (curTicks + (targetFreq / 8) >= targetFreq && curTicks < targetFreq) curTicks = targetFreq;\n"
    "        if (curTicks < targetFreq) return;\n"
    "#endif\n"
)
content = content.replace(anchor, replacement, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

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
