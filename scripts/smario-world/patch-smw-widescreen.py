#!/usr/bin/env python3
"""Wires up snesrev/smw's dormant widescreen plumbing (Phase 2).

Applied at build time against a fresh clone, after patch-smw-emscripten.py
(the two are independent; this one never touches the main loop). The LakeSnes
PPU shared with zelda3 already renders extra side columns, but smw ships with
the headroom constant at 0 and nothing parsing or assigning it. Patches:

  src/snes/ppu.h
    1. kPpuExtraLeftRight 0 -> 96 (18:9 with square pixels; same max as
       zelda3) and kPpuXPixels derived from it, sizing the line buffers.
    2. new Ppu.renderFlags field (smw's PpuBeginDrawing discarded the flags).

  src/snes/ppu.c
    3. store render_flags in PpuBeginDrawing;
    4. ppu_evaluateSprites: extend the vanilla 0..256 x-culling to the
       extra side region (zelda3 does the same with extra_left_right);
    5. ppu_evaluateSprites: honor kPpuRenderFlags_NoSpriteLimits. With more
       sprites in range per line, the stock 32-sprite/34-tile line limits
       would cause new dropout that vanilla 4:3 never showed.

  src/config.c
    6. parse "ExtendedAspectRatio = W:H" ([Graphics]); square pixels, so
       extra = (224*W/H - 256)/2 per side, "16:9" -> 71. "4:3" is vanilla
       256x224 (zelda3 semantics; 8:7 also computes to 0). Clamped to
       kPpuExtraLeftRight. g_snes_width already derives from this value.

  src/main.c
    7. size g_pixels/g_my_pixels for the maximum width;
    8. PpuBeginDrawing with g_snes_width pitch and real render flags;
    9. RtlDrawPpuFrame: copy g_snes_width-wide rows, and refresh the PPUs'
       extraLeftRight/extraLeftCur/extraRightCur every frame (ppu_reset
       zeroes them, ppu_copy clobbers them). The game logic is unpatched, so
       unlike zelda3 there is no per-frame PpuSetExtraSideSpace clamping
       yet: the full extent renders always (known artifacts at level edges;
       the wide-snes patch checklist addresses those in later sessions).

Usage: patch-smw-widescreen.py <smw-repo-root>
"""
import sys

root = sys.argv[1]


def patch_file(rel, patches):
    path = root + "/" + rel
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    for old, new in patches:
        count = content.count(old)
        if count != 1:
            sys.exit("patch-smw-widescreen: anchor in %s matched %d times (expected 1):\n%s"
                     % (rel, count, old))
        content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


# --- src/snes/ppu.h ---------------------------------------------------------
patch_file("src/snes/ppu.h", [
    # 1. Side headroom: 96 extra pixels per side (18:9), zelda3's maximum.
    (
        "  kPpuXPixels = 256,\n"
        "  kPpuExtraLeftRight = 0,\n",
        "  kPpuExtraLeftRight = 96,\n"
        "  kPpuXPixels = 256 + kPpuExtraLeftRight * 2,\n",
    ),
    # 2. Keep the render flags around (needed for NoSpriteLimits below).
    (
        "  uint32_t renderPitch;\n"
        "  uint8_t *renderBuffer;\n",
        "  uint32_t renderPitch;\n"
        "  uint8_t *renderBuffer;\n"
        "  uint32_t renderFlags;\n",
    ),
])

# --- src/snes/ppu.c ---------------------------------------------------------
patch_file("src/snes/ppu.c", [
    # 3. PpuBeginDrawing used to discard render_flags entirely.
    (
        "void PpuBeginDrawing(Ppu *ppu, uint8_t *pixels, size_t pitch, uint32_t render_flags) {\n"
        "  ppu->renderPitch = (uint)pitch;\n"
        "  ppu->renderBuffer = pixels;\n"
        "}\n",
        "void PpuBeginDrawing(Ppu *ppu, uint8_t *pixels, size_t pitch, uint32_t render_flags) {\n"
        "  ppu->renderPitch = (uint)pitch;\n"
        "  ppu->renderBuffer = pixels;\n"
        "  ppu->renderFlags = render_flags;\n"
        "}\n",
    ),
    # 5a. Per-line sprite/tile limits become variables.
    (
        "  int spritesFound = 0;\n"
        "  int tilesFound = 0;\n",
        "  int spritesFound = 0;\n"
        "  int tilesFound = 0;\n"
        "  int spritesLimit = 32, tilesLimit = 34;\n"
        "  if (ppu->renderFlags & kPpuRenderFlags_NoSpriteLimits)\n"
        "    spritesLimit = tilesLimit = 1024;\n",
    ),
    # 4a. A sprite at x in [256, 256+extra) is visible on the right extension,
    #     not wrapped to negative (zelda3: x -= (x >= 256+extra) * 512).
    (
        "      if(x > 255) x -= 512;\n"
        "      // if in x-range\n"
        "      if(x > -spriteSize) {\n",
        "      if(x >= 256 + ppu->extraLeftRight) x -= 512;\n"
        "      // if in x-range\n"
        "      if(x > -(spriteSize + ppu->extraLeftRight)) {\n",
    ),
    # 5b.
    (
        "        if(spritesFound > 32) {\n",
        "        if(spritesFound > spritesLimit) {\n",
    ),
    # 4b. Fetch sprite tiles overlapping the extra side regions too.
    (
        "          if(col + x > -8 && col + x < 256) {\n",
        "          if(col + x > -8 - ppu->extraLeftRight && col + x < 256 + ppu->extraLeftRight) {\n",
    ),
    # 5c.
    (
        "            if(tilesFound > 34) {\n",
        "            if(tilesFound > tilesLimit) {\n",
    ),
    # 5d.
    (
        "        if(tilesFound > 34) break; // break out of sprite-loop if max tiles found\n",
        "        if(tilesFound > tilesLimit) break; // break out of sprite-loop if max tiles found\n",
    ),
])

# --- src/config.c -----------------------------------------------------------
patch_file("src/config.c", [
    # For kPpuExtraLeftRight.
    (
        '#include "util.h"\n',
        '#include "util.h"\n'
        '#include "snes/ppu.h"\n',
    ),
    # 6. [Graphics] ExtendedAspectRatio = W:H.
    (
        '    } else if (StringEqualsNoCase(key, "EnhancedMode7")) {\n',
        '    } else if (StringEqualsNoCase(key, "ExtendedAspectRatio")) {\n'
        '      // Square pixels: extra side pixels = (224*W/H - 256)/2, so\n'
        '      // "16:9" -> 71 and "8:7" -> 0 (vanilla). "4:3" is treated as\n'
        '      // vanilla too, matching zelda3\'s meaning of the key.\n'
        '      const char *sw = NextDelim(&value, \':\');\n'
        '      const char *sh = NextDelim(&value, \':\');\n'
        '      int aspect_w = sw ? atoi(sw) : 0;\n'
        '      int aspect_h = sh ? atoi(sh) : 0;\n'
        '      if (aspect_w <= 0 || aspect_h <= 0)\n'
        '        return false;\n'
        '      int extra = (aspect_w == 4 && aspect_h == 3) ? 0 : (224 * aspect_w / aspect_h - 256) / 2;\n'
        '      g_config.extended_aspect_ratio = IntMin(IntMax(extra, 0), kPpuExtraLeftRight);\n'
        '      return true;\n'
        '    } else if (StringEqualsNoCase(key, "EnhancedMode7")) {\n',
    ),
])

# --- src/main.c --------------------------------------------------------------
patch_file("src/main.c", [
    # 7. Frame buffers sized for the widest supported ratio.
    (
        "static uint8_t g_pixels[256 * 4 * 240];\n"
        "static uint8_t g_my_pixels[256 * 4 * 240];\n",
        "static uint8_t g_pixels[(256 + kPpuExtraLeftRight * 2) * 4 * 240];\n"
        "static uint8_t g_my_pixels[(256 + kPpuExtraLeftRight * 2) * 4 * 240];\n",
    ),
    # 8. Wide pitch + real flags (g_snes_width/g_ppu_render_flags are already
    #    computed from the config earlier in main()).
    (
        "  PpuBeginDrawing(g_snes->ppu, g_pixels, 256 * 4, 0);\n"
        "  PpuBeginDrawing(g_my_ppu, g_my_pixels, 256 * 4, 0);\n",
        "  PpuBeginDrawing(g_snes->ppu, g_pixels, g_snes_width * 4, g_ppu_render_flags);\n"
        "  PpuBeginDrawing(g_my_ppu, g_my_pixels, g_snes_width * 4, g_ppu_render_flags);\n",
    ),
    # 9a. Refresh the extra-side fields every frame, before the PPU runs:
    #     ppu_reset (game reset) zeroes them and ppu_copy (savestate load)
    #     clobbers them.
    (
        "  g_rtl_game_info->draw_ppu_frame();\n",
        "  uint8 extra = g_config.extended_aspect_ratio;\n"
        "  g_my_ppu->extraLeftRight = g_my_ppu->extraLeftCur = g_my_ppu->extraRightCur = extra;\n"
        "  g_snes->ppu->extraLeftRight = g_snes->ppu->extraLeftCur = g_snes->ppu->extraRightCur = extra;\n"
        "\n"
        "  g_rtl_game_info->draw_ppu_frame();\n",
    ),
    # 9b. Copy full-width rows into the SDL texture.
    (
        "  for (size_t y = 0, y_end = g_snes_height; y < y_end; y++)\n"
        "    memcpy((uint8 *)pixel_buffer + y * pitch, ppu_pixels + y * 256 * 4, 256 * 4);\n",
        "  size_t row_bytes = g_snes_width * 4;\n"
        "  for (size_t y = 0, y_end = g_snes_height; y < y_end; y++)\n"
        "    memcpy((uint8 *)pixel_buffer + y * pitch, ppu_pixels + y * row_bytes, row_bytes);\n",
    ),
])

print("patch-smw-widescreen: ppu.h, ppu.c, config.c, main.c patched OK")
