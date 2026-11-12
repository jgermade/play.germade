#!/usr/bin/env python3
"""Patches snesrev/smw for the Emscripten build.

Applied at build time against a fresh clone (same convention as the Sonic
games). Patches src/main.c to:
  1. include <emscripten.h>;
  2. use a fixed-size (non-resizable) SDL window so the canvas drawing
     buffer gets the requested size instead of the CSS size;
  3. skip the desktop OpenGL renderer (SDL renderer only on the web);
  4. explicitly init the SDL audio subsystem before opening the device;
  5. extract the main `while (running)` loop body into a file-scope
     function driven by emscripten_set_main_loop (rAF-paced), behind a
     wall-clock accumulator so game logic stays at 60fps regardless of the
     display's rAF rate (skips surplus >60Hz ticks, catches up on <60Hz
     ticks with up to 4 logic frames per callback).

Usage: patch-smw-emscripten.py <smw-repo-root>
"""
import sys

path = sys.argv[1] + "/src/main.c"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()


def replace_once(old, new):
    global content
    count = content.count(old)
    if count != 1:
        sys.exit("patch-smw-emscripten: anchor matched %d times (expected 1):\n%s" % (count, old))
    content = content.replace(old, new, 1)


# 1. emscripten.h
replace_once(
    "#include <SDL.h>\n",
    "#include <SDL.h>\n"
    "#ifdef __EMSCRIPTEN__\n"
    "#include <emscripten.h>\n"
    "#endif\n",
)

# 2. A resizable SDL window makes Emscripten's SDL2 size the drawing buffer
#    from the canvas's CSS size (which can be 0 before layout settles);
#    a fixed-size window gets the requested WindowScale*256x224 buffer and
#    the shell's CSS scales it to the viewport.
replace_once(
    "static uint32 g_win_flags = SDL_WINDOW_RESIZABLE;\n",
    "#ifdef __EMSCRIPTEN__\n"
    "static uint32 g_win_flags = 0;\n"
    "#else\n"
    "static uint32 g_win_flags = SDL_WINDOW_RESIZABLE;\n"
    "#endif\n",
)

# 3. No desktop-GL renderer on the web (opengl.c/glsl_shader.c/gl_core are
#    excluded from the build); force the SDL renderer path.
replace_once(
    "  if (g_config.output_method == kOutputMethod_OpenGL) {\n"
    "    g_win_flags |= SDL_WINDOW_OPENGL;\n"
    "    OpenGLRenderer_Create(&g_renderer_funcs);\n"
    "  } else {\n",
    "  if (g_config.output_method == kOutputMethod_OpenGL) {\n"
    "#ifdef __EMSCRIPTEN__\n"
    "    g_config.output_method = kOutputMethod_SDL;\n"
    "    g_renderer_funcs = kSdlRendererFuncs;\n"
    "#else\n"
    "    g_win_flags |= SDL_WINDOW_OPENGL;\n"
    "    OpenGLRenderer_Create(&g_renderer_funcs);\n"
    "#endif\n"
    "  } else {\n",
)

# 4. Explicit audio subsystem init (same fix the RSDK ports needed).
replace_once(
    "    g_audio_device = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);\n",
    "#ifdef __EMSCRIPTEN__\n"
    "    SDL_InitSubSystem(SDL_INIT_AUDIO);\n"
    "#endif\n"
    "    g_audio_device = SDL_OpenAudioDevice(NULL, 0, &want, &have, 0);\n",
)

# 5. Main loop extraction.
locals_and_while = (
    "  bool running = true;\n"
    "  uint32 lastTick = SDL_GetTicks();\n"
    "  uint32 curTick = 0;\n"
    "  uint32 frameCtr = 0;\n"
    "  uint8 audiopaused = true;\n"
    "  bool has_bug_in_title = false;\n"
    "  GamepadInfo *gi;\n"
    "\n"
    "  while (running) {\n"
)
loop_end = (
    "      }\n"
    "    }\n"
    "  }\n"
    "\n"
    "  if (g_config.autosave)\n"
    "    HandleCommand(kKeys_Save + 0, true);\n"
)

if content.count(locals_and_while) != 1 or content.count(loop_end) != 1:
    sys.exit("patch-smw-emscripten: loop anchors not found")

head, rest = content.split(locals_and_while, 1)
body, tail = rest.split(loop_end, 1)
body += "      }\n    }\n"  # closers of the frame-delay block, cut by the split

# `continue` is invalid once the body is a function; SDL_Delay would busy-wait
# the browser main thread, so it is native-only.
paused_block = (
    "    if (g_paused) {\n"
    "      SDL_Delay(16);\n"
    "      continue;\n"
    "    }\n"
)
if body.count(paused_block) != 1:
    sys.exit("patch-smw-emscripten: paused block anchor not found")
body = body.replace(
    paused_block,
    "    if (g_paused) {\n"
    "#ifndef __EMSCRIPTEN__\n"
    "      SDL_Delay(16);\n"
    "#endif\n"
    "      return;\n"
    "    }\n",
)

# The manual SDL_Delay frame pacing is native-only: on the web the loop is
# paced by requestAnimationFrame plus the accumulator below.
delay_marker = "\n    // if vsync isn't working, delay manually\n"
if body.count(delay_marker) != 1:
    sys.exit("patch-smw-emscripten: frame-delay anchor not found")
body_run, body_delay = body.split(delay_marker, 1)
body = (
    body_run
    + "\n#ifndef __EMSCRIPTEN__\n"
    + "    // if vsync isn't working, delay manually\n"
    + body_delay
    + "#endif\n"
)

frame_func = (
    "static bool running = true;\n"
    "static uint32 lastTick, curTick, frameCtr;\n"
    "static uint8 audiopaused = true;\n"
    "static bool has_bug_in_title = false;\n"
    "static GamepadInfo *gi;\n"
    "\n"
    "static void RunOneFrameIteration(void) {\n"
    + body
    + "}\n"
    "\n"
    "#ifdef __EMSCRIPTEN__\n"
    "// rAF-paced: rAF fires at the display's refresh rate (or slower when the\n"
    "// tab is throttled), so run 60fps logic frames from a wall-clock\n"
    "// accumulator: surplus ticks on 120Hz+ displays run no frame, and slow\n"
    "// ticks (<60Hz) catch up with up to 4 frames per tick.\n"
    "static void EmscriptenFrameLoop(void) {\n"
    "  static double accum, last_time;\n"
    "  double now = emscripten_get_now();\n"
    "  accum += (last_time == 0) ? 16.6667 : now - last_time;\n"
    "  last_time = now;\n"
    "  if (accum > 66.7) accum = 66.7;  // tab was hidden: drop the backlog\n"
    "  // 16.0 (not 16.667) so vsync jitter at exactly 60Hz doesn't skip frames.\n"
    "  for (int loops = 0; accum >= 16.0 && loops < 4; loops++) {\n"
    "    accum -= 16.6667;\n"
    "    if (accum < 0) accum = 0;\n"
    "    RunOneFrameIteration();\n"
    "  }\n"
    "}\n"
    "#endif\n"
    "\n"
)

main_marker = "int main(int argc, char** argv) {\n"
if head.count(main_marker) != 1:
    sys.exit("patch-smw-emscripten: main() anchor not found")
head = head.replace(main_marker, frame_func + main_marker, 1)

content = (
    head
    + "  lastTick = SDL_GetTicks();\n"
    "#ifdef __EMSCRIPTEN__\n"
    "  emscripten_set_main_loop(EmscriptenFrameLoop, 0, 1);\n"
    "#else\n"
    "  while (running)\n"
    "    RunOneFrameIteration();\n"
    "#endif\n"
    "\n"
    "  if (g_config.autosave)\n"
    "    HandleCommand(kKeys_Save + 0, true);\n"
    + tail
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("patch-smw-emscripten: main.c patched OK")
