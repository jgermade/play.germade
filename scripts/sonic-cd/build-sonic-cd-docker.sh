#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic-cd-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/sonic-cd"
TARGET_DIR="$ROOT_DIR/public/game/sonic-cd"
SETTINGS_FILE="$ROOT_DIR/scripts/sonic-cd/settings-sonic-cd.ini"
SCRIPTS_DIR="$ROOT_DIR/scripts/sonic-cd"

echo "Setting up workspace (Sonic CD)..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"

echo "Cloning Sonic-CD-11-Decompilation repository..."
git clone --depth=1 https://github.com/Rubberduckycooly/Sonic-CD-11-Decompilation.git "$WORK_DIR"
git -C "$WORK_DIR" submodule update --init --recursive

if [ ! -f "$ASSETS_DIR/Data.rsdk" ]; then
    echo "Error: Data.rsdk not found in $ASSETS_DIR"
    exit 1
fi

echo "Vendoring libtheora (pinned @ 28fd5ec77f0ad0e07a371cef1047828116f6bd8a)..."
THEORA_TMP="$(mktemp -d)"
git clone --quiet https://github.com/xiph/theora.git "$THEORA_TMP"
git -C "$THEORA_TMP" checkout --quiet "28fd5ec77f0ad0e07a371cef1047828116f6bd8a"
mkdir -p "$WORK_DIR/dependencies/emscripten/libtheora/lib" "$WORK_DIR/dependencies/emscripten/libtheora/include/theora"
cp "$THEORA_TMP"/lib/*.c "$THEORA_TMP"/lib/*.h "$WORK_DIR/dependencies/emscripten/libtheora/lib/"
cp "$THEORA_TMP"/include/theora/*.h "$WORK_DIR/dependencies/emscripten/libtheora/include/theora/"
touch "$WORK_DIR/dependencies/emscripten/libtheora/lib/cpu.c"
rm -rf "$THEORA_TMP"

echo "Copying Data.rsdk and settings.ini into build directory..."
cp "$ASSETS_DIR/Data.rsdk" "$WORK_DIR/Data.rsdk"
cp "$SETTINGS_FILE" "$WORK_DIR/settings.ini"

echo "Patching RetroEngine.hpp and Drawing.cpp for Emscripten platform..."
python3 - "$WORK_DIR/RSDKv3/RetroEngine.hpp" <<'PYEOF'
import sys
import os
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

anchor = "#define RETRO_LINUX (9)\n"
content = content.replace(anchor, anchor + "#define RETRO_EMSCRIPTEN (10)\n", 1)

anchor = (
    "#elif defined __linux__\n"
    "#define RETRO_PLATFORM (RETRO_LINUX)\n"
    "#else\n"
    "#define RETRO_PLATFORM (RETRO_WIN) // Default\n"
    "#endif\n"
)
replacement = (
    "#elif defined __EMSCRIPTEN__\n"
    "#define RETRO_PLATFORM (RETRO_EMSCRIPTEN)\n"
    + anchor
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_OSX || RETRO_PLATFORM == RETRO_iOS || RETRO_PLATFORM == RETRO_VITA                        \\\n"
    "    || RETRO_PLATFORM == RETRO_UWP || RETRO_PLATFORM == RETRO_ANDROID || RETRO_PLATFORM == RETRO_LINUX\n"
)
replacement = (
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_OSX || RETRO_PLATFORM == RETRO_iOS || RETRO_PLATFORM == RETRO_VITA                        \\\n"
    "    || RETRO_PLATFORM == RETRO_UWP || RETRO_PLATFORM == RETRO_ANDROID || RETRO_PLATFORM == RETRO_LINUX || RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#ifndef RETRO_USING_OPENGL\n"
    "#define RETRO_USING_OPENGL (1)\n"
    "#endif\n"
)
replacement = (
    "#ifndef RETRO_USING_OPENGL\n"
    "#if RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
    "#define RETRO_USING_OPENGL (0)\n"
    "#else\n"
    "#define RETRO_USING_OPENGL (1)\n"
    "#endif\n"
    "#endif\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#if RETRO_USING_OPENGL\n"
    "#if RETRO_PLATFORM == RETRO_ANDROID\n"
)
replacement = (
    "#if RETRO_USING_OPENGL\n"
    "#if RETRO_PLATFORM == RETRO_ANDROID || RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_UWP || RETRO_PLATFORM == RETRO_ANDROID || RETRO_PLATFORM == RETRO_LINUX\n"
)
replacement = (
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_UWP || RETRO_PLATFORM == RETRO_ANDROID || RETRO_PLATFORM == RETRO_LINUX || RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "#elif RETRO_PLATFORM == RETRO_LINUX\n"
    "#define RETRO_GAMEPLATFORMID (RETRO_STANDARD)\n"
)
replacement = (
    "#elif RETRO_PLATFORM == RETRO_LINUX || RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
    "#define RETRO_GAMEPLATFORMID (RETRO_STANDARD)\n"
)
content = content.replace(anchor, replacement, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

path2 = path.replace(".hpp", ".cpp")
with open(path2, "r", encoding="utf-8") as f:
    content = f.read()

anchor = (
    "    unsigned long long curTicks   = 0;\n"
    "    unsigned long long prevTicks  = 0;\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "    unsigned long long curTicks   = 0;\n"
    "    unsigned long long prevTicks  = 0;\n"
    "#else\n"
    "    static unsigned long long curTicks   = 0;\n"
    "    static unsigned long long prevTicks  = 0;\n"
    "#endif\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "    while (running) {\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "    while (running)\n"
    "#else\n"
    "    if (running)\n"
    "#endif\n"
    "    {\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "        if (!vsync) {\n"
    "            curTicks = SDL_GetPerformanceCounter();\n"
    "            if (curTicks < prevTicks + targetFreq)\n"
    "                continue;\n"
    "            prevTicks = curTicks;\n"
    "        }\n"
)
replacement = (
    "        if (!vsync) {\n"
    "            curTicks = SDL_GetPerformanceCounter();\n"
    "            if (curTicks < prevTicks + targetFreq)\n"
    "#ifndef __EMSCRIPTEN__\n"
    "                continue;\n"
    "#else\n"
    "                return;\n"
    "#endif\n"
    "            if (prevTicks == 0) prevTicks = curTicks;\n"
    "            else prevTicks += targetFreq;\n"
    "            if (curTicks > prevTicks + targetFreq * 4) prevTicks = curTicks;\n"
    "        }\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "    ReleaseAudioDevice();\n"
    "    StopVideoPlayback();\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "    ReleaseAudioDevice();\n"
    "    StopVideoPlayback();\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "    SDL_GL_SetSwapInterval(Engine.vsync ? 1 : 0);\n"
)
replacement = (
    "#ifndef __EMSCRIPTEN__\n"
    "    SDL_GL_SetSwapInterval(Engine.vsync ? 1 : 0);\n"
    "#endif\n"
)
content = content.replace(anchor, replacement, 1)

anchor = (
    "    SDL_Quit();\n"
    "#endif\n"
    "}\n"
)
replacement = (
    "    SDL_Quit();\n"
    "#endif\n"
    "#endif\n"
    "}\n"
)
content = content.replace(anchor, replacement, 1)

with open(path2, "w", encoding="utf-8") as f:
    f.write(content)

path3 = path.replace("RetroEngine.hpp", "main.cpp")
with open(path3, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("emscripten_set_main_loop(main_loop, 0, 1);", "emscripten_set_main_loop(main_loop, 60, 1);", 1)

with open(path3, "w", encoding="utf-8") as f:
    f.write(content)

PYEOF

sed -i.bak 's/#if RETRO_PLATFORM != RETRO_ANDROID && RETRO_PLATFORM != RETRO_OSX/#if RETRO_PLATFORM != RETRO_ANDROID \&\& RETRO_PLATFORM != RETRO_OSX \&\& RETRO_PLATFORM != RETRO_EMSCRIPTEN/' "$WORK_DIR/RSDKv3/Drawing.cpp"

echo "Patching Makefile for Emscripten..."
cat << 'MAKEFILE_EOF' > "$WORK_DIR/Makefile"
CXX = em++
CC = emcc
PORTS = -s USE_SDL=2 -s USE_SDL_MIXER=2 -s USE_ZLIB=1 -s USE_LIBPNG=1 -s USE_LIBJPEG=1 -s USE_OGG=1 -s USE_VORBIS=1
CFLAGS = -O3 -I dependencies/all/ -I dependencies/mac/ -I dependencies/emscripten/libtheora/include/ -I dependencies/all/theoraplay/ -I dependencies/all/tinyxml2/ -I . $(PORTS)
CXXFLAGS = $(CFLAGS) -std=c++17
LDFLAGS = -s TOTAL_MEMORY=268435456 -s STACK_SIZE=5242880 --preload-file Data.rsdk --preload-file settings.ini $(PORTS) --bind

SOURCES_CXX = \
    RSDKv3/RetroEngine.cpp \
    RSDKv3/Animation.cpp \
    RSDKv3/Audio.cpp \
    RSDKv3/Collision.cpp \
    RSDKv3/Debug.cpp \
    RSDKv3/Drawing.cpp \
    RSDKv3/Ini.cpp \
    RSDKv3/Input.cpp \
    RSDKv3/main.cpp \
    RSDKv3/Math.cpp \
    RSDKv3/ModAPI.cpp \
    RSDKv3/Object.cpp \
    RSDKv3/Palette.cpp \
    RSDKv3/Player.cpp \
    RSDKv3/Reader.cpp \
    RSDKv3/Scene.cpp \
    RSDKv3/Scene3D.cpp \
    RSDKv3/Script.cpp \
    RSDKv3/Sprite.cpp \
    RSDKv3/String.cpp \
    RSDKv3/Text.cpp \
    RSDKv3/Userdata.cpp \
    RSDKv3/Video.cpp \
    RSDKv3/WebDevMenu.cpp \
    dependencies/all/tinyxml2/tinyxml2.cpp

SOURCES_C = \
    dependencies/all/theoraplay/theoraplay.c \
    dependencies/emscripten/libtheora/lib/apiwrapper.c \
    dependencies/emscripten/libtheora/lib/bitpack.c \
    dependencies/emscripten/libtheora/lib/cpu.c \
    dependencies/emscripten/libtheora/lib/decapiwrapper.c \
    dependencies/emscripten/libtheora/lib/decinfo.c \
    dependencies/emscripten/libtheora/lib/decode.c \
    dependencies/emscripten/libtheora/lib/dequant.c \
    dependencies/emscripten/libtheora/lib/fragment.c \
    dependencies/emscripten/libtheora/lib/huffdec.c \
    dependencies/emscripten/libtheora/lib/idct.c \
    dependencies/emscripten/libtheora/lib/info.c \
    dependencies/emscripten/libtheora/lib/internal.c \
    dependencies/emscripten/libtheora/lib/quant.c \
    dependencies/emscripten/libtheora/lib/state.c

OBJECTS = $(SOURCES_CXX:.cpp=.o) $(SOURCES_C:.c=.o)
EXECUTABLE = wasm/index.js

all: $(EXECUTABLE)

$(EXECUTABLE): $(OBJECTS)
	mkdir -p wasm
	$(CXX) $(OBJECTS) $(LDFLAGS) -o $@

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(EXECUTABLE)
MAKEFILE_EOF

echo "Patching main.cpp to fix Emscripten initialization order..."
cat << 'MAIN_EOF' > "$WORK_DIR/patch_main.cpp"
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

#ifdef __EMSCRIPTEN__
    SDL_Init(SDL_INIT_EVERYTHING);
	emscripten_set_main_loop(main_loop, 0, 1);
#else
    Engine.Init();
    Engine.Run();
#endif

    return 0;
}
MAIN_EOF
mv "$WORK_DIR/patch_main.cpp" "$WORK_DIR/RSDKv3/main.cpp"

echo "Patching Audio.cpp to initialize audio explicitly..."
sed -i.bak 's/if ((audioDevice = SDL_OpenAudioDevice/SDL_InitSubSystem(SDL_INIT_AUDIO); if ((audioDevice = SDL_OpenAudioDevice/' "$WORK_DIR/RSDKv3/Audio.cpp"

echo "Patching Input.cpp to forcibly initialize controllers continuously with fallback mapping..."
perl -0777 -pi -e 's/void ProcessInput\(\)\n\{/void ProcessInput()\n{\n#if RETRO_USING_SDL2\n    for (int i = 0; i < SDL_NumJoysticks(); ++i) {\n        if (!SDL_GameControllerFromInstanceID(i)) {\n            if (!SDL_IsGameController(i)) {\n                char mapping[1024];\n                SDL_JoystickGUID guid = SDL_JoystickGetDeviceGUID(i);\n                char guid_str[33];\n                SDL_JoystickGetGUIDString(guid, guid_str, sizeof(guid_str));\n                snprintf(mapping, sizeof(mapping), "%s,Web Gamepad,a:b0,b:b1,x:b2,y:b3,back:b8,start:b9,leftstick:b10,rightstick:b11,leftshoulder:b4,rightshoulder:b5,dpup:b12,dpdown:b13,dpleft:b14,dpright:b15,leftx:a0,lefty:a1,rightx:a2,righty:a3,lefttrigger:b6,righttrigger:b7,", guid_str);\n                SDL_GameControllerAddMapping(mapping);\n            }\n            ControllerInit(i);\n        }\n    }\n#endif/g' "$WORK_DIR/RSDKv3/Input.cpp"

echo "Adding WebDevMenu.cpp (web replacement for the native Escape dev menu)..."
cat << 'WEBMENU_EOF' > "$WORK_DIR/RSDKv3/WebDevMenu.cpp"
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

    activeStageList   = listIdx;
    stageListPosition = stageIdx;
    stageMode         = STAGEMODE_LOAD;
    Engine.gameMode   = ENGINE_MAINGAME;
    SetGlobalVariableByName("options.gameMode", 0);
}

void web_devmenu_set_paused(bool paused)
{
    Engine.masterPaused = paused;
}

EMSCRIPTEN_BINDINGS(web_devmenu)
{
    emscripten::function("web_devmenu_get_stage_list", &web_devmenu_get_stage_list);
    emscripten::function("web_devmenu_load_stage", &web_devmenu_load_stage);
    emscripten::function("web_devmenu_set_paused", &web_devmenu_set_paused);
}
WEBMENU_EOF

echo "Building WASM via Docker (emscripten/emsdk:latest)..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    make

echo "Copying build output to $TARGET_DIR..."
cp -R "$WORK_DIR/wasm/"* "$TARGET_DIR/"

echo "Copying custom index.html to $TARGET_DIR..."
cp "$SCRIPTS_DIR/index.html" "$TARGET_DIR/index.html"

echo "Build complete. Output available in $TARGET_DIR"
