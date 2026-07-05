#!/usr/bin/env bash
set -euo pipefail

# Builds Sonic Mania (RSDKv5U decompilation) as WASM inside Docker.
#
# Unlike Sonic 1/2 (RSDKv4, which already had a community Emscripten fork to
# adapt) or Sonic 3 A.I.R. (which publishes its own official prebuilt web
# release), RSDKv5-Decompilation has no Emscripten platform at all upstream —
# only Windows/Linux/Android/NintendoSwitch. This script clones the real
# source, patches in a new Emscripten platform (dependencies/RSDKv5/platforms/
# Emscripten.cmake, written here) and a handful of engine patches, then
# compiles for real via emscripten/emsdk's CMake toolchain.
#
# Usage: scripts/sonic-mania/build-sonic-mania-docker.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_DIR="$ROOT_DIR/.tmp/sonic-mania-wasm-build"
ASSETS_DIR="$ROOT_DIR/game-assets/sonic-mania"
TARGET_DIR="$ROOT_DIR/public/game/sonic-mania"
SCRIPTS_DIR="$ROOT_DIR/scripts/sonic-mania"

# Pinned for reproducibility (checked as of writing this script).
SONIC_MANIA_COMMIT="9dc699428420d752af9767bdb13f585ee0881bc0"
OGG_COMMIT="06a5e0262cdc28aa4ae6797627a783b5010440f0"
THEORA_COMMIT="28fd5ec77f0ad0e07a371cef1047828116f6bd8a"

if [ ! -f "$ASSETS_DIR/Data.rsdk" ]; then
    echo "Error: Data.rsdk not found in $ASSETS_DIR"
    exit 1
fi

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$TARGET_DIR"

echo "Cloning Sonic-Mania-Decompilation (pinned @ $SONIC_MANIA_COMMIT)..."
git clone https://github.com/RSDKModding/Sonic-Mania-Decompilation.git "$WORK_DIR"
git -C "$WORK_DIR" checkout --quiet "$SONIC_MANIA_COMMIT"
git -C "$WORK_DIR" submodule update --init --recursive

RSDK_DIR="$WORK_DIR/dependencies/RSDKv5"

echo "Vendoring libogg (pinned @ $OGG_COMMIT) — no system package under Emscripten..."
OGG_TMP="$(mktemp -d)"
git clone --quiet https://github.com/xiph/ogg.git "$OGG_TMP"
git -C "$OGG_TMP" checkout --quiet "$OGG_COMMIT"
mkdir -p "$RSDK_DIR/dependencies/emscripten/libogg/src" "$RSDK_DIR/dependencies/emscripten/libogg/include/ogg"
cp "$OGG_TMP/src/bitwise.c" "$OGG_TMP/src/framing.c" "$OGG_TMP/src/crctable.h" "$RSDK_DIR/dependencies/emscripten/libogg/src/"
cp "$OGG_TMP/include/ogg/ogg.h" "$OGG_TMP/include/ogg/os_types.h" "$RSDK_DIR/dependencies/emscripten/libogg/include/ogg/"
# config_types.h is normally autotools/cmake-generated from config_types.h.in;
# reuse the copy already vendored (and committed) for the Android build,
# since it's just fixed-width int typedefs with no platform dependency.
cp "$RSDK_DIR/dependencies/android/libogg/include/ogg/config_types.h" "$RSDK_DIR/dependencies/emscripten/libogg/include/ogg/config_types.h"
rm -rf "$OGG_TMP"

echo "Vendoring libtheora (pinned @ $THEORA_COMMIT) — used by Video.cpp's cutscene playback, also no system package..."
THEORA_TMP="$(mktemp -d)"
git clone --quiet https://github.com/xiph/theora.git "$THEORA_TMP"
git -C "$THEORA_TMP" checkout --quiet "$THEORA_COMMIT"
# THEORA_DIR is hardcoded to dependencies/android/libtheora by the shared
# (non-platform-specific) CMakeLists.txt regardless of which platform is
# actually building, so that's where it needs to live even for our
# Emscripten build.
mkdir -p "$RSDK_DIR/dependencies/android/libtheora/lib" "$RSDK_DIR/dependencies/android/libtheora/include/theora"
cp "$THEORA_TMP"/lib/*.c "$THEORA_TMP"/lib/*.h "$RSDK_DIR/dependencies/android/libtheora/lib/"
cp "$THEORA_TMP"/include/theora/*.h "$RSDK_DIR/dependencies/android/libtheora/include/theora/"
# RSDKv5's own top-level CMakeLists.txt hardcodes cpu.c in COMPILE_THEORA's
# file list, but upstream xiph/theora has no such file (state.c just sets
# cpu_flags = 0 directly, no oc_cpu_flags_get() call to satisfy) — an empty
# translation unit satisfies the reference harmlessly.
touch "$RSDK_DIR/dependencies/android/libtheora/lib/cpu.c"
rm -rf "$THEORA_TMP"

echo "Patching RetroEngine.hpp to add an Emscripten platform (RETRO_EMSCRIPTEN)..."
python3 - "$RSDK_DIR/RSDKv5/RSDK/Core/RetroEngine.hpp" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. New platform constant, alongside RETRO_WIN/RETRO_LINUX/etc.
anchor = "#define RETRO_ANDROID (7)\n#define RETRO_UWP     (8)\n"
assert content.count(anchor) == 1
content = content.replace(anchor, anchor + "#define RETRO_EMSCRIPTEN (9)\n", 1)

# 2. Auto-detection: emcc defines __EMSCRIPTEN__ (and __unix__, but NOT
# __linux__), so without this it would fall through to the final #else
# (RETRO_WIN, pulling in <windows.h> — a hard compile error).
anchor = (
    "#elif defined __linux__\n"
    "#define RETRO_PLATFORM   (RETRO_LINUX)\n"
    "#define RETRO_DEVICETYPE (RETRO_STANDARD)\n"
    "#else\n"
)
assert content.count(anchor) == 1
replacement = (
    "#elif defined __EMSCRIPTEN__\n"
    "#define RETRO_PLATFORM   (RETRO_EMSCRIPTEN)\n"
    "#define RETRO_DEVICETYPE (RETRO_STANDARD)\n"
    + anchor
)
content = content.replace(anchor, replacement, 1)

# 3. Force the SDL2 render/input/audio backends for this platform (mirrors
# the OSX/iOS branch just above it — Emscripten only realistically supports
# SDL2 here, not GLFW/EGL/MiniAudio).
anchor = (
    "#undef RETRO_INPUTDEVICE_SDL2\n"
    "#define RETRO_INPUTDEVICE_SDL2 (1)\n"
    "\n"
    "#endif\n"
    "\n"
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_UWP\n"
)
assert content.count(anchor) == 1
replacement = (
    "#undef RETRO_INPUTDEVICE_SDL2\n"
    "#define RETRO_INPUTDEVICE_SDL2 (1)\n"
    "\n"
    "#elif RETRO_PLATFORM == RETRO_EMSCRIPTEN\n"
    "\n"
    "#undef RETRO_RENDERDEVICE_SDL2\n"
    "#define RETRO_RENDERDEVICE_SDL2 (1)\n"
    "\n"
    "#undef RETRO_AUDIODEVICE_SDL2\n"
    "#define RETRO_AUDIODEVICE_SDL2 (1)\n"
    "\n"
    "#undef RETRO_INPUTDEVICE_SDL2\n"
    "#define RETRO_INPUTDEVICE_SDL2 (1)\n"
    "\n"
    "#endif\n"
    "\n"
    "#if RETRO_PLATFORM == RETRO_WIN || RETRO_PLATFORM == RETRO_UWP\n"
)
content = content.replace(anchor, replacement, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

echo "Patching RetroEngine.cpp so its main loop runs under Emscripten without Asyncify..."
python3 - "$RSDK_DIR/RSDKv5/RSDK/Core/RetroEngine.cpp" <<'PYEOF'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. #include <emscripten.h> for emscripten_set_main_loop/cancel_main_loop.
anchor = "#if RETRO_PLATFORM == RETRO_ANDROID\n#include <jni.h>\n#include <unistd.h>\n#endif\n"
assert content.count(anchor) == 1
content = content.replace(anchor, anchor + "\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif\n", 1)

# 2. Forward declarations for the two functions RunRetroEngine() is about to
# be split into (see below).
anchor = "RetroEngine RSDK::engine = RetroEngine();\n\nint32 RSDK::RunRetroEngine(int32 argc, char *argv[])\n"
assert content.count(anchor) == 1
content = content.replace(
    anchor,
    "RetroEngine RSDK::engine = RetroEngine();\n\n"
    "static void RunRetroEngineFrame();\n"
    "static void ShutdownRetroEngine();\n\n"
    "int32 RSDK::RunRetroEngine(int32 argc, char *argv[])\n",
    1,
)

# 3. RunRetroEngine()'s main loop is a plain native-style while() that
# busy-waits on CheckFPSCap() -- fine natively (the OS scheduler doesn't
# care), but under Emscripten that would hot-spin the browser's one and only
# thread. An Asyncify-based emscripten_sleep() yield was tried first (much
# smaller diff, keeping the while() loop as-is) but it caused real "function
# signature mismatch" crashes once actual gameplay was reached -- a known
# class of Asyncify bug around indirect calls through RSDK's function-
# pointer-heavy object/mod dispatch. So instead, the loop body becomes an
# emscripten_set_main_loop() callback: the browser paces the calls itself
# (via requestAnimationFrame, fps=0 below), CheckFPSCap() early-returns on
# ticks faster than the target rate, and every old `continue` (skip to next
# iteration) becomes a `return` (skip to the next call of this function).
anchor = (
    "    RenderDevice::InitFPSCap();\n"
    "\n"
    "    while (RenderDevice::isRunning) {\n"
    "        RenderDevice::ProcessEvents();\n"
    "\n"
    "        if (!RenderDevice::isRunning)\n"
    "            break;\n"
    "\n"
    "        if (RenderDevice::CheckFPSCap()) {\n"
    "            RenderDevice::UpdateFPSCap();\n"
    "\n"
    "            AudioDevice::FrameInit();\n"
    "\n"
    "#if RETRO_REV02\n"
    "            SKU::userCore->FrameInit();\n"
    "\n"
    "            if (SKU::userCore->CheckEnginePause())\n"
    "                continue;\n"
)
assert content.count(anchor) == 1
replacement = (
    "    RenderDevice::InitFPSCap();\n"
    "\n"
    "#ifdef __EMSCRIPTEN__\n"
    "    emscripten_set_main_loop(RunRetroEngineFrame, 0, 1);\n"
    "#else\n"
    "    while (RenderDevice::isRunning)\n"
    "        RunRetroEngineFrame();\n"
    "#endif\n"
    "\n"
    "    ShutdownRetroEngine();\n"
    "\n"
    "    return 0;\n"
    "}\n"
    "\n"
    "#ifdef __EMSCRIPTEN__\n"
    "static void StopEmscriptenMainLoop()\n"
    "{\n"
    "    emscripten_cancel_main_loop();\n"
    "    ShutdownRetroEngine();\n"
    "}\n"
    "#endif\n"
    "\n"
    "static void RunRetroEngineFrame()\n"
    "{\n"
    "    RenderDevice::ProcessEvents();\n"
    "\n"
    "    if (!RenderDevice::isRunning) {\n"
    "#ifdef __EMSCRIPTEN__\n"
    "        StopEmscriptenMainLoop();\n"
    "#endif\n"
    "        return;\n"
    "    }\n"
    "\n"
    "    if (RenderDevice::CheckFPSCap()) {\n"
    "        RenderDevice::UpdateFPSCap();\n"
    "\n"
    "        AudioDevice::FrameInit();\n"
    "\n"
    "#if RETRO_REV02\n"
    "        SKU::userCore->FrameInit();\n"
    "\n"
    "        if (SKU::userCore->CheckEnginePause())\n"
    "            return;\n"
)
content = content.replace(anchor, replacement, 1)

# 4. The rest of the old loop body is unchanged except every remaining bare
# `continue;` (still at its original indentation, since only the lines above
# were touched) becomes `return;` -- two left.
anchor = (
    "            if (!engine.initialized || (engine.focusState & 1)) {\n"
    "                if (videoSettings.windowState != WINDOWSTATE_ACTIVE)\n"
    "                    continue;\n"
    "            }\n"
)
assert content.count(anchor) == 1
content = content.replace(
    anchor,
    "            if (!engine.initialized || (engine.focusState & 1)) {\n"
    "                if (videoSettings.windowState != WINDOWSTATE_ACTIVE)\n"
    "                    return;\n"
    "            }\n",
    1,
)

anchor = (
    "                if (videoSettings.windowState != WINDOWSTATE_ACTIVE)\n"
    "                    continue;\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "                for (int32 t = 0; t < touchInfo.count; ++t) {\n"
)
assert content.count(anchor) == 1
content = content.replace(
    anchor,
    "                if (videoSettings.windowState != WINDOWSTATE_ACTIVE)\n"
    "                    return;\n"
    "\n"
    "#if !RETRO_USE_ORIGINAL_CODE\n"
    "                for (int32 t = 0; t < touchInfo.count; ++t) {\n",
    1,
)

# 5. Close RunRetroEngineFrame() where the while loop used to close, and turn
# the old inline "// Shutdown" tail into its own function (called both from
# the native while-loop path above and from StopEmscriptenMainLoop()).
anchor = (
    "            RenderDevice::FlipScreen();\n"
    "        }\n"
    "    }\n"
    "\n"
    "    // Shutdown\n"
    "\n"
    "    ReleaseInputDevices();\n"
    "    AudioDevice::Release();\n"
    "    RenderDevice::Release(false);\n"
    "    SaveSettingsINI(false);\n"
    "    SKU::ReleaseUserCore();\n"
    "    ReleaseStorage();\n"
    "#if RETRO_USE_MOD_LOADER\n"
    "    UnloadMods();\n"
    "#endif\n"
    "\n"
    "    Link::Close(gameLogicHandle);\n"
    "    gameLogicHandle = NULL;\n"
    "\n"
    "    if (engine.consoleEnabled)\n"
    "        ReleaseConsole();\n"
    "\n"
    "    return 0;\n"
    "}\n"
)
assert content.count(anchor) == 1
replacement = (
    "        RenderDevice::FlipScreen();\n"
    "    }\n"
    "}\n"
    "\n"
    "static void ShutdownRetroEngine()\n"
    "{\n"
    "    ReleaseInputDevices();\n"
    "    AudioDevice::Release();\n"
    "    RenderDevice::Release(false);\n"
    "    SaveSettingsINI(false);\n"
    "    SKU::ReleaseUserCore();\n"
    "    ReleaseStorage();\n"
    "#if RETRO_USE_MOD_LOADER\n"
    "    UnloadMods();\n"
    "#endif\n"
    "\n"
    "    Link::Close(gameLogicHandle);\n"
    "    gameLogicHandle = NULL;\n"
    "\n"
    "    if (engine.consoleEnabled)\n"
    "        ReleaseConsole();\n"
    "}\n"
)
content = content.replace(anchor, replacement, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
PYEOF

echo "Writing dependencies/RSDKv5/platforms/Emscripten.cmake..."
cat << 'EOF' > "$RSDK_DIR/platforms/Emscripten.cmake"
add_executable(RetroEngine ${RETRO_FILES})

set(RETRO_SUBSYSTEM "SDL2" CACHE STRING "The subsystem to use")

# Neither libogg nor libtheora (used for Video.cpp's cutscene playback) ship
# system packages under Emscripten, unlike a real Linux/pkg-config setup, so
# always compile them from source like Android does. DEP_PATH controls where
# COMPILE_OGG looks (dependencies/${DEP_PATH}/libogg); THEORA_DIR is hardcoded
# to dependencies/android/libtheora by the top-level CMakeLists.txt regardless
# of platform, so that's where the build script vendors theora's source too.
set(DEP_PATH emscripten)
set(COMPILE_OGG TRUE)
set(COMPILE_THEORA TRUE)

if(NOT DEFINED GAME_DATA_DIR)
    set(GAME_DATA_DIR ${CMAKE_SOURCE_DIR})
endif()

set_target_properties(RetroEngine PROPERTIES SUFFIX ".js")

target_compile_options(RetroEngine PRIVATE -sUSE_SDL=2)

target_link_options(RetroEngine PRIVATE
    -sUSE_SDL=2
    # NOT ALLOW_MEMORY_GROWTH: once wasm memory has `maximum > initial` (what
    # growth requires), Chromium backs Memory.buffer with a "resizable"
    # ArrayBuffer, and its WebGL/TextDecoder APIs outright refuse to read from
    # one ("...must not be resizable") -- hit both in glShaderSource's string
    # conversion and in glTexSubImage2D's pixel upload during a first pass.
    # A fixed-size heap (initial == maximum) avoids the resizable path
    # entirely, at the cost of a hard OOM instead of graceful growth if this
    # ever proves too small.
    -sTOTAL_MEMORY=536870912
    -sSTACK_SIZE=5242880
    # RSDKv5/Mania's object system calls Update/Draw/etc. through generic
    # function-pointer tables; some registered functions don't exactly match
    # the pointer type they're called through (native ABIs tolerate this,
    # it's technically UB; wasm's call_indirect does not, and traps with
    # "function signature mismatch" instead -- only reproduces once you
    # actually enter a zone and play, not just sitting on the title screen).
    # This routes mismatched indirect calls through a runtime-adapting
    # wrapper instead of trapping.
    -sEMULATE_FUNCTION_POINTER_CASTS=1
    # wasm-opt's --fpcast-emu pass (added by the flag above) refuses to run
    # against its own default limit ("max-func-params needs to be at least
    # 17"); raise it explicitly.
    -sBINARYEN_EXTRA_PASSES=pass-arg=max-func-params@17
    -sFORCE_FILESYSTEM=1
    -sEXPORTED_RUNTIME_METHODS=[FS,callMain]
    "SHELL:--preload-file ${GAME_DATA_DIR}/Data.rsdk@Data.rsdk"
    "SHELL:--preload-file ${GAME_DATA_DIR}/Settings.ini@Settings.ini"
)
EOF

echo "Copying Data.rsdk and writing Settings.ini into build directory..."
cp "$ASSETS_DIR/Data.rsdk" "$WORK_DIR/Data.rsdk"
cat << 'EOF' > "$WORK_DIR/Settings.ini"
[Game]
dataFile=Data.rsdk
devMenu=0
language=0
region=-1

[Video]
windowed=1
border=1
exclusiveFS=0
vsync=0
tripleBuffering=0
pixWidth=424
winWidth=424
winHeight=240
fsWidth=0
fsHeight=0
refreshRate=60
shaderSupport=0
screenShader=0

[Audio]
streamsEnabled=1
streamVolume=0.8
sfxVolume=1.0
EOF

echo "Building via Docker (emscripten/emsdk:latest)..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    bash -c "emcmake cmake -B build -DGAME_STATIC=ON -DPLATFORM=Emscripten -DCMAKE_BUILD_TYPE=Release && cmake --build build -j\$(nproc)"

echo "Copying build output to $TARGET_DIR..."
cp "$WORK_DIR/build/dependencies/RSDKv5/RSDKv5U.js" \
   "$WORK_DIR/build/dependencies/RSDKv5/RSDKv5U.wasm" \
   "$WORK_DIR/build/dependencies/RSDKv5/RSDKv5U.data" \
   "$TARGET_DIR/"

echo "Copying custom index.html to $TARGET_DIR..."
cp "$SCRIPTS_DIR/index.html" "$TARGET_DIR/index.html"

echo "Build complete. Output available in $TARGET_DIR"
