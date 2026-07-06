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

Step 3 (wide-snes game-logic port, incremental) — iteration 1, the core of
wide-snes level_sprites.asm. Where wide-snes hardcodes !extra_columns at
patch time, we apply the equivalent at runtime via g_widescreen_extra
(= g_config.extended_aspect_ratio; 0 in 4:3 keeps vanilla behavior exact):

  src/smw_rtl.h   — g_widescreen_extra + WideExtendBound() helper (the ASM
                    adjust_offscreen macro: bound >= 0x8000 ? -x : +x).
  src/main.c      — define/assign g_widescreen_extra after config parse.
  src/smw_02.c    — $02A7F6 horizontal sprite spawn range {-x, 0, +x} (the
                    vertical-level branch stays vanilla, like wide-snes);
                    $02D007 SUB_OFF_SCREEN X-bounds; $02D398/$03B780
                    GetDrawInfo range (banks 2+3 share one C routine).
  src/smw_01.c    — $01AC11 SUB_OFF_SCREEN X-bounds; $01A385 GetDrawInfo
                    range; $01C9F9 chained-platform draw range.
  src/smw_03.c    — $03B83F SUB_OFF_SCREEN X-bounds.

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

# --- step 3, iteration 1: level_sprites spawn/despawn margins ----------------

# src/smw_rtl.h — runtime equivalent of wide-snes' !extra_columns.
patch_file("src/smw_rtl.h", [
    (
        "extern bool g_lunar_magic;\n"
        "extern int g_dbg_ctr_mine;\n",
        "extern bool g_lunar_magic;\n"
        "extern int g_dbg_ctr_mine;\n"
        "\n"
        "// Widescreen: extra visible pixels per side (0 in 4:3), assigned from\n"
        "// g_config.extended_aspect_ratio in main(). Used by the wide-snes-style\n"
        "// sprite spawn/despawn margin patches in smw_01/02/03.c.\n"
        "extern uint16 g_widescreen_extra;\n"
        "// wide-snes' adjust_offscreen macro: widen a signed 16-bit screen-relative\n"
        "// bound away from zero.\n"
        "static inline uint16 WideExtendBound(uint16 v) {\n"
        "  return v >= 0x8000 ? v - g_widescreen_extra : v + g_widescreen_extra;\n"
        "}\n",
    ),
])

patch_file("src/main.c", [
    (
        "static int g_snes_width, g_snes_height;\n",
        "static int g_snes_width, g_snes_height;\n"
        "uint16 g_widescreen_extra;\n",
    ),
    (
        "  g_snes_width = (g_config.extended_aspect_ratio * 2 + 256);\n",
        "  g_widescreen_extra = g_config.extended_aspect_ratio;\n"
        "  g_snes_width = (g_config.extended_aspect_ratio * 2 + 256);\n",
    ),
])

patch_file("src/smw_01.c", [
    # $01AC11: SUB_OFF_SCREEN X despawn bounds (bank 01, horizontal levels).
    (
        "        uint16 t = PAIR16(kSubOffscreen_Bank01_SpriteOffScreen2_Hi[v4], kSubOffscreen_Bank01_SpriteOffScreen2_Lo[v4]) +\n"
        "            mirror_current_layer1_xpos - GetSprXPos(k);\n",
        "        uint16 t = WideExtendBound(PAIR16(kSubOffscreen_Bank01_SpriteOffScreen2_Hi[v4], kSubOffscreen_Bank01_SpriteOffScreen2_Lo[v4])) +\n"
        "            mirror_current_layer1_xpos - GetSprXPos(k);\n",
    ),
    # $01A385: sprites stop being drawn outside [-0x40, 0x140) of the camera.
    (
        "  uint16 tx = GetSprXPos(k) + 0x40 - mirror_current_layer1_xpos;\n"
        "  spr_table15c4[k] = (tx >= 0x180);\n"
        "  if (tx >= 0x180) {\n",
        "  uint16 tx = GetSprXPos(k) + 0x40 + g_widescreen_extra - mirror_current_layer1_xpos;\n"
        "  spr_table15c4[k] = (tx >= 0x180 + 2 * g_widescreen_extra);\n"
        "  if (tx >= 0x180 + 2 * g_widescreen_extra) {\n",
    ),
    # $01C9F9: chained platform draw range [-0x10, 0x110).
    (
        "  uint16 t = pt.x - mirror_current_layer1_xpos + 16;\n"
        "  uint8 v1 = flag_sprites_locked | (t >= 0x120);\n",
        "  uint16 t = pt.x - mirror_current_layer1_xpos + 16 + g_widescreen_extra;\n"
        "  uint8 v1 = flag_sprites_locked | (t >= 0x120 + 2 * g_widescreen_extra);\n",
    ),
])

patch_file("src/smw_02.c", [
    # $02A7F6: horizontal spawn range {$D0-x, $00, $20+x} by scroll direction.
    # Only the horizontal-level branch; wide-snes keeps vertical levels on the
    # vanilla table via a mirrored copy.
    (
        "    uint16 t = kParseLevelSpriteList_DATA_02A7F6[camera_layer1_scrolling_direction] + (uint8)mirror_current_layer1_xpos;\n",
        "    static const int8 kWideSpawnSign[3] = { -1, 0, 1 };\n"
        "    uint16 t = (uint8)(kParseLevelSpriteList_DATA_02A7F6[camera_layer1_scrolling_direction] +\n"
        "                       kWideSpawnSign[camera_layer1_scrolling_direction] * g_widescreen_extra) +\n"
        "               (uint8)mirror_current_layer1_xpos;\n",
    ),
    # $02D007: SUB_OFF_SCREEN X despawn bounds (bank 02).
    (
        "    uint16 xpos = PAIR16(kSubOffscreen_Bank02_DATA_02D00F[r1], kSubOffscreen_Bank02_DATA_02D007[r1]) +\n"
        "        mirror_current_layer1_xpos - GetSprXPos(k);\n",
        "    uint16 xpos = WideExtendBound(PAIR16(kSubOffscreen_Bank02_DATA_02D00F[r1], kSubOffscreen_Bank02_DATA_02D007[r1])) +\n"
        "        mirror_current_layer1_xpos - GetSprXPos(k);\n",
    ),
    # $02D398 + $03B780 (one deduplicated C routine): draw range as $01A385.
    (
        "  bool carry = (uint16)(GetSprXPos(k) - mirror_current_layer1_xpos + 0x40) >= 0x180;\n",
        "  bool carry = (uint16)(GetSprXPos(k) - mirror_current_layer1_xpos + 0x40 + g_widescreen_extra) >= 0x180 + 2 * g_widescreen_extra;\n",
    ),
])

patch_file("src/smw_03.c", [
    # $03B83F: SUB_OFF_SCREEN X despawn bounds (bank 03).
    (
        "      uint16 xpos =\n"
        "          PAIR16(kSubOffscreen_Bank03_DATA_03B847[r1], kSubOffscreen_Bank03_DATA_03B83F[r1]) + mirror_current_layer1_xpos - GetSprXPos(k);\n",
        "      uint16 xpos =\n"
        "          WideExtendBound(PAIR16(kSubOffscreen_Bank03_DATA_03B847[r1], kSubOffscreen_Bank03_DATA_03B83F[r1])) + mirror_current_layer1_xpos - GetSprXPos(k);\n",
    ),
])

# --- step 3, iteration 2: level_render (camera-inset model) ------------------
# The camera keeps g_widescreen_extra pixels away from the level edges so the
# wide view never shows wrapped tilemap content. From wide-snes main.asm
# (camera_x_limit_horz/vert) and level_render.asm; see the session log for
# the hook table.

patch_file("src/smw_00.c", [
    # $00F78E camera_x_limit_vert: X clamp inside vertical levels
    # [0, 0x100] -> [extra, 0x100-extra].
    (
        "        uint16 v8 = mirror_current_layer1_xpos + r2w;\n"
        "        if ((int16)v8 < 0)\n"
        "          v8 = 0;\n"
        "        if (!sign16(v8 - 257))\n"
        "          v8 = 256;\n",
        "        uint16 v8 = mirror_current_layer1_xpos + r2w;\n"
        "        if ((int16)v8 < (int16)g_widescreen_extra)\n"
        "          v8 = g_widescreen_extra;\n"
        "        if (!sign16(v8 - (257 - g_widescreen_extra)))\n"
        "          v8 = 256 - g_widescreen_extra;\n",
    ),
    # $00F73F camera_x_limit_horz: clamp [0, (screens-1)*256] ->
    # [extra, (screens-1)*256 - extra]; single-screen levels pin the camera
    # to 0 (the wide view stays centered on the only screen).
    (
        "          uint16 v3 = mirror_current_layer1_xpos + r2w;\n"
        "          if ((int16)(mirror_current_layer1_xpos + r2w) < 0)\n"
        "            v3 = 0;\n"
        "          mirror_current_layer1_xpos = v3;\n"
        "          int16 v5 = (camera_last_screen_horiz - 1) << 8;\n"
        "          if (v5 < 0)\n"
        "            v5 = 128;\n"
        "          if (sign16(v5 - mirror_current_layer1_xpos))\n"
        "            mirror_current_layer1_xpos = v5;\n",
        "          uint16 v3 = mirror_current_layer1_xpos + r2w;\n"
        "          if ((int16)(mirror_current_layer1_xpos + r2w) < (int16)g_widescreen_extra)\n"
        "            v3 = g_widescreen_extra;\n"
        "          mirror_current_layer1_xpos = v3;\n"
        "          int16 v5 = (camera_last_screen_horiz - 1) << 8;\n"
        "          if (g_widescreen_extra && v5 == 0) {\n"
        "            mirror_current_layer1_xpos = 0;\n"
        "          } else {\n"
        "            if (v5 < 0)\n"
        "              v5 = 128;\n"
        "            v5 -= g_widescreen_extra;\n"
        "            if (sign16(v5 - mirror_current_layer1_xpos))\n"
        "              mirror_current_layer1_xpos = v5;\n"
        "          }\n",
    ),
    # $00E9A1 check_player_camera: widen the "Mario too far from the camera"
    # range from 8-bit [0, 0xF0) to 16-bit [-extra, 0xF0+extra).
    (
        "  } else if ((uint8)player_on_screen_pos_x < 0xF0) {\n",
        "  } else if ((uint16)(player_on_screen_pos_x + g_widescreen_extra) < 0xF0 + 2 * g_widescreen_extra) {\n",
    ),
])

patch_file("src/smw_05.c", [
    # $05D849 init_scroll: initial camera position inset by extra.
    (
        "      mirror_current_layer1_xpos = 0;\n"
        "      mirror_current_layer2_xpos = 0;\n",
        "      mirror_current_layer1_xpos = g_widescreen_extra;\n"
        "      mirror_current_layer2_xpos = g_widescreen_extra;\n",
    ),
    # $05D923 horz_customizer: rooms whose camera must stay fixed (and
    # centered relative to the wide region). Y at the hook == r14w.
    (
        "  flag_layer1_horiz_scroll_level_setting = 1;\n",
        "  flag_layer1_horiz_scroll_level_setting = 1;\n"
        "  if (g_widescreen_extra) {\n"
        "    if (r14w == 0xFA)  // ghost house bonus: no scroll\n"
        "      flag_layer1_horiz_scroll_level_setting = 0;\n"
        "    if (r14w == 0x003 || r14w == 0x0E4 || r14w == 0x104) {\n"
        "      // top secret area / big boo fight / yoshi's house\n"
        "      mirror_current_layer1_xpos = 0x100;\n"
        "      flag_layer1_horiz_scroll_level_setting = 0;\n"
        "    } else if (r14w == 0x0D3 || r14w == 0x1F2 || r14w == 0x1C9) {\n"
        "      // wendy / lemmy / cloud sublevel\n"
        "      mirror_current_layer1_xpos = 0x400;\n"
        "      flag_layer1_horiz_scroll_level_setting = 0;\n"
        "    }\n"
        "  }\n",
    ),
    # $0580A9/$0580B0 force_whole_render: on 1-screen levels compute the
    # tilemap columns as if the camera were at 0x80 so the whole 512px
    # buffer is filled (the side extensions then have real content).
    (
        "  if (g_lunar_magic)\n"
        "    LmHook_InitializeLevelLayer1And2Tilemaps();\n"
        "  CalculateRowOrColumnOfTilemapToUpdate();\n",
        "  if (g_lunar_magic)\n"
        "    LmHook_InitializeLevelLayer1And2Tilemaps();\n"
        "  uint16 saved_layer1_x = mirror_current_layer1_xpos;\n"
        "  if (g_widescreen_extra && (uint8)(camera_last_screen_horiz - 1) == 0)\n"
        "    mirror_current_layer1_xpos = 0x80;\n"
        "  CalculateRowOrColumnOfTilemapToUpdate();\n"
        "  mirror_current_layer1_xpos = saved_layer1_x;\n",
    ),
    # $05BEBC l2_vertx_h: vertical layer-1+2 levels start inset too. The
    # preceding line disambiguates from the identical (unpatched, per
    # wide-snes) block in Spr0ED_Layer2Falls.
    (
        "  *(uint16 *)l1_l2_scroll_spr_scroll_type_index = kSpr0EF_Layer2ScrollSOrL_DATA_05CA42[v0];\n"
        "  mirror_current_layer1_xpos = 0;\n"
        "  PointU16 *pt = get_PointU16(misc_layer1_pos, 0);\n"
        "  pt->x = 0;\n"
        "  mirror_current_layer2_xpos = 0;\n"
        "  pt[1].x = 0;\n",
        "  *(uint16 *)l1_l2_scroll_spr_scroll_type_index = kSpr0EF_Layer2ScrollSOrL_DATA_05CA42[v0];\n"
        "  mirror_current_layer1_xpos = g_widescreen_extra;\n"
        "  PointU16 *pt = get_PointU16(misc_layer1_pos, 0);\n"
        "  pt->x = g_widescreen_extra;\n"
        "  mirror_current_layer2_xpos = g_widescreen_extra;\n"
        "  pt[1].x = g_widescreen_extra;\n",
    ),
    # $05BEFE sign-overflow fix (layer-2 sideways long scroll sprite): keep
    # bit 8 of the sum in widescreen. With extra==0 the 0xff mask over the
    # 16-bit sum is mod-256-identical to the original 8-bit expression.
    (
        "  uint16 v5 = (uint8)(LOBYTE(get_PointU16(misc_layer1_pos, scroll_spr_layer_index)->x) + v3);\n",
        "  uint16 v5 = (uint16)(get_PointU16(misc_layer1_pos, scroll_spr_layer_index)->x + (int8)v3) &\n"
        "              (g_widescreen_extra ? 0x1ff : 0xff);\n",
    ),
])

# --- step 3, iteration 4: get_draw_info 9-bit OAM core -----------------------
# Vanilla uses the OAM x MSB (size buffer bit 0) as a "hide this tile" flag;
# with the extended PPU that instead PLACES the tile at x+256, so hidden
# tiles teleport into the side extensions. Port of wide-snes'
# !sprite_wide_flag_table machinery for the generic draw paths.

patch_file("src/smw_rtl.h", [
    (
        "static inline uint16 WideExtendBound(uint16 v) {\n"
        "  return v >= 0x8000 ? v - g_widescreen_extra : v + g_widescreen_extra;\n"
        "}\n",
        "static inline uint16 WideExtendBound(uint16 v) {\n"
        "  return v >= 0x8000 ? v - g_widescreen_extra : v + g_widescreen_extra;\n"
        "}\n"
        "// wide-snes' !sprite_wide_flag_table: bit 8 of each sprite's\n"
        "// screen-relative x, computed in GetDrawInfo and OR'd into the OAM MSB\n"
        "// by the generic draw routines (always 0 when not widescreen).\n"
        "extern uint8 g_sprite_wide_flag[32];\n",
    ),
])

patch_file("src/main.c", [
    (
        "uint16 g_widescreen_extra;\n",
        "uint16 g_widescreen_extra;\n"
        "uint8 g_sprite_wide_flag[32];\n",
    ),
])

# $01A36B get_draw_info_1 + test_offscreen.
patch_file("src/smw_01.c", [
    (
        "GetDrawInfoRes GetDrawInfo_Bank01_ReturnsTwice(uint8 k) {  // 01a365\n"
        "  spr_yoffscreen_flag[k] = 0;\n"
        "  spr_xoffscreen_flag[k] = (uint16)(GetSprXPos(k) - mirror_current_layer1_xpos) >= 256;\n",
        "GetDrawInfoRes GetDrawInfo_Bank01_ReturnsTwice(uint8 k) {  // 01a365\n"
        "  spr_yoffscreen_flag[k] = 0;\n"
        "  uint16 wide_sx1 = GetSprXPos(k) - mirror_current_layer1_xpos;\n"
        "  g_sprite_wide_flag[k] = g_widescreen_extra ? (wide_sx1 >> 8) & 1 : 0;\n"
        "  spr_xoffscreen_flag[k] = g_widescreen_extra\n"
        "      ? (int16)wide_sx1 < -(int16)(g_widescreen_extra + 0x10) ||\n"
        "        (int16)wide_sx1 >= 0x100 + (int16)g_widescreen_extra\n"
        "      : wide_sx1 >= 256;\n",
    ),
    # $019DCC / $019F51: OAM MSB = wide flag instead of the offscreen flag.
    (
        "  uint8 v6 = spr_xoffscreen_flag[k] | 2;\n",
        "  uint8 v6 = (g_widescreen_extra ? g_sprite_wide_flag[k] : spr_xoffscreen_flag[k]) | 2;\n",
    ),
    (
        "  sprites_oamtile_size_buffer[v1 + 64] = spr_xoffscreen_flag[v3] | 2;\n",
        "  sprites_oamtile_size_buffer[v1 + 64] = (g_widescreen_extra ? g_sprite_wide_flag[v3] : spr_xoffscreen_flag[v3]) | 2;\n",
    ),
    # $01B80D test_for_offscreen: per-tile X test in the generic finish-OAM
    # routine — trash tiles outside the wide view, real bit 8 inside.
    (
        "    uint16 r4w = r2w + (int8)(oam[64].xpos - r7);\n"
        "    if (FinishOAMWrite_01B844(r4w))\n"
        "      sprites_oamtile_size_buffer[(v3 >> 2) + 64] |= 1;\n",
        "    uint16 r4w = r2w + (int8)(oam[64].xpos - r7);\n"
        "    if (g_widescreen_extra) {\n"
        "      int16 tile_sx = r4w - mirror_current_layer1_xpos;\n"
        "      if (tile_sx < -(int16)(g_widescreen_extra + 0x10) ||\n"
        "          tile_sx >= 0x100 + (int16)g_widescreen_extra)\n"
        "        oam[64].ypos = -16;\n"
        "      else\n"
        "        sprites_oamtile_size_buffer[(v3 >> 2) + 64] |= (tile_sx >> 8) & 1;\n"
        "    } else if (FinishOAMWrite_01B844(r4w)) {\n"
        "      sprites_oamtile_size_buffer[(v3 >> 2) + 64] |= 1;\n"
        "    }\n",
    ),
    # $01C957 chain_test_for_offscreen: chained platform tile loop.
    (
        "    if (FinishOAMWrite_01B844(r4w) & 1)\n"
        "      sprites_oamtile_size_buffer[(v15 >> 2) + 64] = 3;\n",
        "    if (g_widescreen_extra) {\n"
        "      int16 tile_sx = r4w - mirror_current_layer1_xpos;\n"
        "      if (tile_sx < -(int16)(g_widescreen_extra + 0x10) ||\n"
        "          tile_sx >= 0x100 + (int16)g_widescreen_extra)\n"
        "        v18[64].ypos = -16;\n"
        "      else\n"
        "        sprites_oamtile_size_buffer[(v15 >> 2) + 64] = 2 | ((tile_sx >> 8) & 1);\n"
        "    } else if (FinishOAMWrite_01B844(r4w) & 1) {\n"
        "      sprites_oamtile_size_buffer[(v15 >> 2) + 64] = 3;\n"
        "    }\n",
    ),
])

# $02D37E/$03B766 get_draw_info_2/3 (banks 2+3 share this C routine).
patch_file("src/smw_02.c", [
    (
        "GetDrawInfoRes GetDrawInfo_Bank23_ReturnsTwice(uint8 k) {  // 02d378\n"
        "  spr_yoffscreen_flag[k] = 0;\n"
        "  spr_xoffscreen_flag[k] = (uint16)(GetSprXPos(k) - mirror_current_layer1_xpos) >= 256;\n",
        "GetDrawInfoRes GetDrawInfo_Bank23_ReturnsTwice(uint8 k) {  // 02d378\n"
        "  spr_yoffscreen_flag[k] = 0;\n"
        "  uint16 wide_sx1 = GetSprXPos(k) - mirror_current_layer1_xpos;\n"
        "  g_sprite_wide_flag[k] = g_widescreen_extra ? (wide_sx1 >> 8) & 1 : 0;\n"
        "  spr_xoffscreen_flag[k] = g_widescreen_extra\n"
        "      ? (int16)wide_sx1 < -(int16)(g_widescreen_extra + 0x10) ||\n"
        "        (int16)wide_sx1 >= 0x100 + (int16)g_widescreen_extra\n"
        "      : wide_sx1 >= 256;\n",
    ),
])

# --- step 3, iteration 3: bounce/score/quake sprites (9-bit OAM x) -----------
# From level_bounce_sprites.asm, level_score_sprites.asm and
# level_quake_sprites.asm: compute the screen-relative X in 16 bits, widen
# the draw gate to [-extra-0x20, 0x100+extra+0x20) and store bit 8 in the
# OAM size/MSB buffer (bit 0 = OAM x bit 8) so the PPU places the tile in
# the side extensions. 4:3 keeps the vanilla gates (and the vanilla quake
# hitbox typo) bit-exact.

patch_file("src/smw_02.c", [
    # $029201 bounce_gfx / $02925C bounce_set_msb (BounceSpriteDraw).
    (
        "  if (bounce_spr_ypos_hi[k] == (uint8)((bounce_spr_ypos_lo[k] < r2) + r4) &&\n"
        "      bounce_spr_xpos_hi[k] == (uint8)((bounce_spr_xpos_lo[k] < r3) + r5)) {\n",
        "  uint16 wide_sx = PAIR16(bounce_spr_xpos_hi[k], bounce_spr_xpos_lo[k]) - PAIR16(r5, r3);\n"
        "  bool wide_x_ok = g_widescreen_extra\n"
        "      ? (int16)wide_sx >= -(int16)(g_widescreen_extra + 0x20) &&\n"
        "        (int16)wide_sx < 0x100 + g_widescreen_extra + 0x20\n"
        "      : bounce_spr_xpos_hi[k] == (uint8)((bounce_spr_xpos_lo[k] < r3) + r5);\n"
        "  if (bounce_spr_ypos_hi[k] == (uint8)((bounce_spr_ypos_lo[k] < r2) + r4) && wide_x_ok) {\n",
    ),
    (
        "    oam->charnum = kBounceSpriteGFXRt_Tiles[bounce_spr_spriteid[k] - 1];\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = 2;\n",
        "    oam->charnum = kBounceSpriteGFXRt_Tiles[bounce_spr_spriteid[k] - 1];\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = 2 | ((wide_sx >> 8) & 1);\n",
    ),
    # $02AE61/$02AEB1/$02AEEC score sprites (ProcessScoreSprites_Sub).
    (
        "  if (!((uint16)(xpos + 12) >> 8) && !(xpos >> 8) && !(ypos >> 8)) {\n",
        "  bool wide_score_ok = g_widescreen_extra\n"
        "      ? (int16)xpos >= -(int16)(g_widescreen_extra + 0x20) &&\n"
        "        (int16)xpos < 0x100 + g_widescreen_extra + 0x20 && !(ypos >> 8)\n"
        "      : !((uint16)(xpos + 12) >> 8) && !(xpos >> 8) && !(ypos >> 8);\n"
        "  if (wide_score_ok) {\n",
    ),
    (
        "    sprites_oamtile_size_buffer[v21] = 0;\n"
        "    sprites_oamtile_size_buffer[v21 + 1] = 0;\n",
        "    sprites_oamtile_size_buffer[v21] = (xpos >> 8) & 1;\n"
        "    sprites_oamtile_size_buffer[v21 + 1] = ((xpos + 8) >> 8) & 1;\n",
    ),
    # $0286D6 quake sprite hitbox X-hi typo, fixed only in widescreen.
    (
        "    SetHiLo(&bounce_spr_hitbox_y_hi[j], &bounce_spr_hitbox_x_lo[j], player_xpos);  // snes bug\n",
        "    SetHiLo(g_widescreen_extra ? &bounce_spr_hitbox_x_hi[j] : &bounce_spr_hitbox_y_hi[j],\n"
        "            &bounce_spr_hitbox_x_lo[j], player_xpos);  // snes bug, fixed in widescreen\n",
    ),
])

# --- step 3, iteration 5: wings, koopa eyes/shake, smushed -------------------
# Sprite-specific OAM fixes from level_sprites.asm. Dry bones ($01E465) is
# deliberately NOT ported yet: its FinishOAMWrite index reordering needs a
# side-by-side with the vanilla disassembly (see session log).

patch_file("src/smw_01.c", [
    # $019E61/$019E8D: koopa/?-block wings drawn across the wide view with a
    # real 9th x bit instead of being culled at the vanilla window.
    (
        "    uint16 t2 = t - mirror_current_layer1_xpos;\n"
        "    oam[64].xpos = t2;\n"
        "    if (t2 < 256) {\n"
        "      oam[64].ypos = kDrawWingTiles_YDisp[v2] + r1 - mirror_current_layer1_ypos;\n"
        "      oam[64].charnum = kDrawWingTiles_Tiles[v2];\n"
        "      oam[64].flags = kDrawWingTiles_Prop[v2] | sprites_tile_priority;\n"
        "      sprites_oamtile_size_buffer[(v1 >> 2) + 64] = kDrawWingTiles_TileSize[v2];\n"
        "    }\n",
        "    uint16 t2 = t - mirror_current_layer1_xpos;\n"
        "    oam[64].xpos = t2;\n"
        "    bool wing_visible = g_widescreen_extra\n"
        "        ? (int16)t2 >= -(int16)(g_widescreen_extra + 0x10) &&\n"
        "          (int16)t2 < 0x100 + (int16)g_widescreen_extra\n"
        "        : t2 < 256;\n"
        "    if (wing_visible) {\n"
        "      oam[64].ypos = kDrawWingTiles_YDisp[v2] + r1 - mirror_current_layer1_ypos;\n"
        "      oam[64].charnum = kDrawWingTiles_Tiles[v2];\n"
        "      oam[64].flags = kDrawWingTiles_Prop[v2] | sprites_tile_priority;\n"
        "      sprites_oamtile_size_buffer[(v1 >> 2) + 64] =\n"
        "          kDrawWingTiles_TileSize[v2] | (g_widescreen_extra ? (t2 >> 8) & 1 : 0);\n"
        "    }\n",
    ),
    # $019846 shake_koopa_shell: the shake jitter may cross the 256 boundary;
    # keep the 8-bit add and flip the sprite's wide flag on carry (the eyes
    # below reuse the flag), then rewrite the shell tile's MSB.
    (
        "      OamEnt *oam = get_OamEnt(oam_buf, v3);\n"
        "      int xpos = oam[66].xpos + (v4 & 1);\n"
        "      if (xpos < 256)\n"
        "        oam[66].xpos = xpos;\n",
        "      OamEnt *oam = get_OamEnt(oam_buf, v3);\n"
        "      int xpos = oam[66].xpos + (v4 & 1);\n"
        "      if (g_widescreen_extra) {\n"
        "        oam[66].xpos = xpos;\n"
        "        if (!spr_yoffscreen_flag[k]) {\n"
        "          if (xpos >= 256)\n"
        "            g_sprite_wide_flag[k] ^= 1;\n"
        "          sprites_oamtile_size_buffer[(v3 >> 2) + 66] = 2 | g_sprite_wide_flag[k];\n"
        "        }\n"
        "      } else if (xpos < 256) {\n"
        "        oam[66].xpos = xpos;\n"
        "      }\n",
    ),
    # $019864 koopa_eyes: eye tiles at shell_x+2 / shell_x+6 get MSB = wide
    # flag XOR the carry of each displacement.
    (
        "      uint8 v15 = v17 >> 2;\n"
        "      sprites_oamtile_size_buffer[v15 + 64] = 0;\n"
        "      sprites_oamtile_size_buffer[v15 + 65] = 0;\n",
        "      uint8 v15 = v17 >> 2;\n"
        "      if (g_widescreen_extra && !spr_yoffscreen_flag[k]) {\n"
        "        sprites_oamtile_size_buffer[v15 + 64] = g_sprite_wide_flag[k] ^ (v13[66].xpos >= 254);\n"
        "        sprites_oamtile_size_buffer[v15 + 65] = g_sprite_wide_flag[k] ^ (v13[66].xpos >= 250);\n"
        "      } else {\n"
        "        sprites_oamtile_size_buffer[v15 + 64] = 0;\n"
        "        sprites_oamtile_size_buffer[v15 + 65] = 0;\n"
        "      }\n",
    ),
    # $01E74E smushed: run the (iteration-4-aware) finish-OAM routine instead
    # of writing the size bytes manually.
    (
        "    uint8 v8 = drt.idx >> 2;\n"
        "    sprites_oamtile_size_buffer[v8 + 64] = 0;\n"
        "    sprites_oamtile_size_buffer[v8 + 65] = 0;\n",
        "    uint8 v8 = drt.idx >> 2;\n"
        "    if (g_widescreen_extra) {\n"
        "      FinishOAMWrite(k, 0, 1);\n"
        "    } else {\n"
        "      sprites_oamtile_size_buffer[v8 + 64] = 0;\n"
        "      sprites_oamtile_size_buffer[v8 + 65] = 0;\n"
        "    }\n",
    ),
])

# --- step 3, iteration 7: extended sprites, general path ---------------------
# level_extended_sprites.asm, shared routine + callers. Extended sprites
# (projectiles) use a wider gate [-extra-0x10, 0x110+extra) and are erased
# outside it. Callers that overwrite the size buffer after the generic draw
# preserve the MSB bit it computed.

patch_file("src/smw_rtl.h", [
    (
        "extern uint8 g_sprite_wide_flag[32];\n",
        "extern uint8 g_sprite_wide_flag[32];\n"
        "// wide-snes extended_x_test: gate for extended-sprite (projectile) draws,\n"
        "// sx = 16-bit x minus camera.\n"
        "static inline bool WideExtSpriteVisible(uint16 sx) {\n"
        "  return (int16)sx >= -(int16)(g_widescreen_extra + 0x10) &&\n"
        "         (int16)sx < 0x110 + (int16)g_widescreen_extra;\n"
        "}\n",
    ),
])

patch_file("src/smw_02.c", [
    # $02A1B1 extended_x_test_3: 16-bit gate in the shared fireball routine.
    (
        "  uint8 r0 = (uint8)(ext_spr_xspeed[k] & 0x80 ^ 0x80) >> 1;\n"
        "  uint8 v2 = ext_spr_xpos_lo[k];\n"
        "  uint8 r1 = v2 - mirror_current_layer1_xpos;\n"
        "  if (ext_spr_xpos_hi[k] == (uint8)((v2 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n",
        "  uint8 r0 = (uint8)(ext_spr_xspeed[k] & 0x80 ^ 0x80) >> 1;\n"
        "  uint8 v2 = ext_spr_xpos_lo[k];\n"
        "  uint8 r1 = v2 - mirror_current_layer1_xpos;\n"
        "  uint16 ext_sx = PAIR16(ext_spr_xpos_hi[k], v2) - mirror_current_layer1_xpos;\n"
        "  bool ext_x_ok = g_widescreen_extra\n"
        "      ? WideExtSpriteVisible(ext_sx)\n"
        "      : ext_spr_xpos_hi[k] == (uint8)((v2 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos));\n"
        "  if (ext_x_ok &&\n",
    ),
    # ... and its central MSB write.
    (
        "    if (r1)\n"
        "      oam->flags = v6 & 0xCF | 0x10;\n"
        "    sprites_oamtile_size_buffer[j >> 2] = 0;\n",
        "    if (r1)\n"
        "      oam->flags = v6 & 0xCF | 0x10;\n"
        "    sprites_oamtile_size_buffer[j >> 2] = g_widescreen_extra ? (ext_sx >> 8) & 1 : 0;\n",
    ),
    # $029C61 smoke trail: preserve the MSB from the generic draw.
    (
        "  oam->charnum = kExtSpr0F_SmokeTrail_Tiles[v2];\n"
        "  sprites_oamtile_size_buffer[v1 >> 2] = 2;\n",
        "  oam->charnum = kExtSpr0F_SmokeTrail_Tiles[v2];\n"
        "  sprites_oamtile_size_buffer[v1 >> 2] = 2 | (g_widescreen_extra ? sprites_oamtile_size_buffer[v1 >> 2] & 1 : 0);\n",
    ),
    # $029E7C torpedo ted / launcher arm.
    (
        "    oam->flags = 19;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 2;\n",
        "    oam->flags = 19;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 2 | (g_widescreen_extra ? sprites_oamtile_size_buffer[v3 >> 2] & 1 : 0);\n",
    ),
    # $029F93 yoshi fireball.
    (
        "  oam->flags = ((uint8)(ext_spr_xspeed[k] & 0x80 ^ 0x80) >> 1) | 0x35;\n"
        "  sprites_oamtile_size_buffer[v1 >> 2] = 2;\n",
        "  oam->flags = ((uint8)(ext_spr_xspeed[k] & 0x80 ^ 0x80) >> 1) | 0x35;\n"
        "  sprites_oamtile_size_buffer[v1 >> 2] = 2 | (g_widescreen_extra ? sprites_oamtile_size_buffer[v1 >> 2] & 1 : 0);\n",
    ),
    # $02A19D reznor/piranha fireball.
    (
        "    oam->flags = r0 ^ kExtSpr02_ReznorFireball_Prop[v2];\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = 2;\n",
        "    oam->flags = r0 ^ kExtSpr02_ReznorFireball_Prop[v2];\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = 2 | (g_widescreen_extra ? sprites_oamtile_size_buffer[v1 >> 2] & 1 : 0);\n",
    ),
    # $02A33D hammer/bone.
    (
        "  sprites_oamtile_size_buffer[result >> 2] = 2;\n",
        "  sprites_oamtile_size_buffer[result >> 2] = 2 | (g_widescreen_extra ? sprites_oamtile_size_buffer[result >> 2] & 1 : 0);\n",
    ),
])

# --- step 3, iteration 8: extended sprites, own-gate cases -------------------
# Second half of level_extended_sprites.asm: draws with their own x gates.

patch_file("src/smw_02.c", [
    # $029B5C volcano lotus fire.
    (
        "  if (ext_spr_xpos_hi[k] != (uint8)((v2 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    goto LABEL_18;\n",
        "  uint16 lotus_sx = PAIR16(ext_spr_xpos_hi[k], v2) - mirror_current_layer1_xpos;\n"
        "  if (g_widescreen_extra\n"
        "          ? !WideExtSpriteVisible(lotus_sx)\n"
        "          : ext_spr_xpos_hi[k] != (uint8)((v2 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    goto LABEL_18;\n",
    ),
    (
        "      oam->charnum = v6;\n"
        "      sprites_oamtile_size_buffer[v1 >> 2] = 0;\n",
        "      oam->charnum = v6;\n"
        "      sprites_oamtile_size_buffer[v1 >> 2] = g_widescreen_extra ? (lotus_sx >> 8) & 1 : 0;\n",
    ),
    # $029D04 wiggler flower / cloud coin: wide gate; MSB OR'd after the
    # helpers (wide-snes stores it from the gate's temps at $029D3F/$029D54).
    (
        "    if (ext_spr_xpos_hi[k] == (uint8)((ext_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) {\n"
        "      uint8 v2 = kExtendedSpriteOAMIndexes[k];\n",
        "    uint16 ccoin_sx = PAIR16(ext_spr_xpos_hi[k], ext_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "    if (g_widescreen_extra\n"
        "            ? WideExtSpriteVisible(ccoin_sx)\n"
        "            : ext_spr_xpos_hi[k] == (uint8)((ext_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) {\n"
        "      uint8 v2 = kExtendedSpriteOAMIndexes[k];\n",
    ),
    (
        "        ExtSpr0A_CloudCoin_029D36(v2, 0xB);\n"
        "      } else {\n"
        "        ExtSpr0A_CloudCoin_029D45(v2, r1);\n"
        "      }\n",
        "        ExtSpr0A_CloudCoin_029D36(v2, 0xB);\n"
        "      } else {\n"
        "        ExtSpr0A_CloudCoin_029D45(v2, r1);\n"
        "      }\n"
        "      if (g_widescreen_extra)\n"
        "        sprites_oamtile_size_buffer[v2 >> 2] |= (ccoin_sx >> 8) & 1;\n",
    ),
    # $029EA0 lava splash.
    (
        "  if (ext_spr_xpos_hi[k] == (uint8)((v3 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n"
        "      (oam = get_OamEnt(oam_buf, v2), oam->xpos = r0, (uint8)(ext_spr_ypos_lo[k] - mirror_current_layer1_ypos) < 0xF0)) {\n",
        "  uint16 splash_sx = PAIR16(ext_spr_xpos_hi[k], v3) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra\n"
        "           ? WideExtSpriteVisible(splash_sx)\n"
        "           : ext_spr_xpos_hi[k] == (uint8)((v3 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) &&\n"
        "      (oam = get_OamEnt(oam_buf, v2), oam->xpos = r0, (uint8)(ext_spr_ypos_lo[k] - mirror_current_layer1_ypos) < 0xF0)) {\n",
    ),
    (
        "    oam->flags = sprites_tile_priority | 5;\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = 0;\n",
        "    oam->flags = sprites_tile_priority | 5;\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = g_widescreen_extra ? (splash_sx >> 8) & 1 : 0;\n",
    ),
    # $029F4F breath bubble carry rollout: the random x jiggle can cross the
    # 256 boundary; XOR the (sign-adjusted) carry into the MSB.
    (
        "    OamEnt *oam = get_OamEnt(oam_buf, kExtendedSpriteOAMIndexes[k]);\n"
        "    oam->xpos += r0;\n",
        "    OamEnt *oam = get_OamEnt(oam_buf, kExtendedSpriteOAMIndexes[k]);\n"
        "    if (g_widescreen_extra) {\n"
        "      uint8 bubble_carry = (uint8)(((uint16)oam->xpos + r0) >> 8) ^ ((r0 & 0x80) ? 1 : 0);\n"
        "      sprites_oamtile_size_buffer[kExtendedSpriteOAMIndexes[k] >> 2] ^= bubble_carry;\n"
        "    }\n"
        "    oam->xpos += r0;\n",
    ),
    # $02A271/$02A2B9 baseball (v2's sign still drives the moving-away test
    # when outside the wide gate, since outside implies hi mismatch).
    (
        "    int8 v2 = ext_spr_xpos_hi[k] - ((v1 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos));\n"
        "    if (v2) {\n",
        "    uint16 ball_sx = PAIR16(ext_spr_xpos_hi[k], v1) - mirror_current_layer1_xpos;\n"
        "    int8 v2 = ext_spr_xpos_hi[k] - ((v1 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos));\n"
        "    if (g_widescreen_extra ? !WideExtSpriteVisible(ball_sx) : v2 != 0) {\n",
    ),
    (
        "    oam->flags = (16 * counter_local_frames) & 0xC0 | 0x39;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 0;\n",
        "    oam->flags = (16 * counter_local_frames) & 0xC0 | 0x39;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = g_widescreen_extra ? (ball_sx >> 8) & 1 : 0;\n",
    ),
    # $02A05A/$02A0A0 mario fireball, mode-7 rooms (8-bit 0xF8 gate).
    (
        "  uint8 r0 = (uint8)(ext_spr_xspeed[k] & 0x80) >> 1;\n"
        "  if ((uint8)(ext_spr_xpos_lo[k] - mirror_current_layer1_xpos) >= 0xF8 ||\n",
        "  uint8 r0 = (uint8)(ext_spr_xspeed[k] & 0x80) >> 1;\n"
        "  uint16 m7fire_sx = PAIR16(ext_spr_xpos_hi[k], ext_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra ? !WideExtSpriteVisible(m7fire_sx)\n"
        "                          : (uint8)(ext_spr_xpos_lo[k] - mirror_current_layer1_xpos) >= 0xF8) ||\n",
    ),
    (
        "    if (r1)\n"
        "      oam[64].flags = v4 & 0xCF | 0x10;\n"
        "    sprites_oamtile_size_buffer[(v1 >> 2) + 64] = 0;\n",
        "    if (r1)\n"
        "      oam[64].flags = v4 & 0xCF | 0x10;\n"
        "    sprites_oamtile_size_buffer[(v1 >> 2) + 64] = g_widescreen_extra ? (m7fire_sx >> 8) & 1 : 0;\n",
    ),
])

# --- step 3, iteration 9: minor-extended sprites ------------------------------
# level_minor_extended_sprites.asm. The C port already carries wide-snes'
# 16-bit x infrastructure (the separate $18EA hi table, set at every spawn),
# but the per-frame position update only advanced the low byte, and the
# draws still used vanilla 8-bit gates + MSB-as-hide. The sparkle spawn gate
# ($01B170) is deferred to the smoke_position iteration (smoke x is still
# 8-bit; ungating now would draw wrapped sparkles).

patch_file("src/smw_02.c", [
    # $02B5E5 apply_speed_high_byte: propagate the movement carry into the
    # hi bytes. X can't reuse the Y+12 alias for the hi table ($18EA is not
    # adjacent), mirroring the ASM's #$D6 redirection.
    (
        "void UpdateMinorExtendedSpritePosition_X(uint8 k) {  // 02b5bc\n"
        "  UpdateMinorExtendedSpritePosition_Y(k + 12);\n"
        "}\n"
        "\n"
        "void UpdateMinorExtendedSpritePosition_Y(uint8 k) {  // 02b5c8\n"
        "  uint16 t = mextspr_sub_ypos[k] + (uint8)(16 * mextspr_yspeed[k]);\n"
        "  mextspr_sub_ypos[k] = t;\n"
        "  mextspr_ypos_lo[k] += ((int8)mextspr_yspeed[k] >> 4) + (t >> 8);\n"
        "}\n",
        "void UpdateMinorExtendedSpritePosition_X(uint8 k) {  // 02b5bc\n"
        "  if (g_widescreen_extra) {\n"
        "    uint16 t = mextspr_sub_xpos[k] + (uint8)(16 * mextspr_xspeed[k]);\n"
        "    mextspr_sub_xpos[k] = t;\n"
        "    uint16 pos = (uint16)(PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) +\n"
        "                          ((int8)mextspr_xspeed[k] >> 4) + (t >> 8));\n"
        "    mextspr_xpos_lo[k] = (uint8)pos;\n"
        "    mextspr_xpos_hi[k] = pos >> 8;\n"
        "  } else {\n"
        "    UpdateMinorExtendedSpritePosition_Y(k + 12);\n"
        "  }\n"
        "}\n"
        "\n"
        "void UpdateMinorExtendedSpritePosition_Y(uint8 k) {  // 02b5c8\n"
        "  uint16 t = mextspr_sub_ypos[k] + (uint8)(16 * mextspr_yspeed[k]);\n"
        "  mextspr_sub_ypos[k] = t;\n"
        "  if (g_widescreen_extra) {\n"
        "    uint16 pos = (uint16)(PAIR16(mextspr_ypos_hi[k], mextspr_ypos_lo[k]) +\n"
        "                          ((int8)mextspr_yspeed[k] >> 4) + (t >> 8));\n"
        "    mextspr_ypos_lo[k] = (uint8)pos;\n"
        "    mextspr_ypos_hi[k] = pos >> 8;\n"
        "  } else {\n"
        "    mextspr_ypos_lo[k] += ((int8)mextspr_yspeed[k] >> 4) + (t >> 8);\n"
        "  }\n"
        "}\n",
    ),
    # $028C79/$028CB2 unused yoshi smoke.
    (
        "      if (mextspr_xpos_hi[k] == (uint8)((v6 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) {\n",
        "      uint16 ysmoke_sx = PAIR16(mextspr_xpos_hi[k], v6) - mirror_current_layer1_xpos;\n"
        "      if (g_widescreen_extra\n"
        "              ? WideExtSpriteVisible(ysmoke_sx)\n"
        "              : mextspr_xpos_hi[k] == (uint8)((v6 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) {\n",
    ),
    (
        "          oam->flags = sprites_tile_priority | 8;\n"
        "          sprites_oamtile_size_buffer[v5 >> 2] = 0;\n",
        "          oam->flags = sprites_tile_priority | 8;\n"
        "          sprites_oamtile_size_buffer[v5 >> 2] = g_widescreen_extra ? (ysmoke_sx >> 8) & 1 : 0;\n",
    ),
    # $028D0A/$028D3C boo stream.
    (
        "  if (mextspr_xpos_hi[k] != (uint8)((v5 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    return;\n",
        "  uint16 boo_sx = PAIR16(mextspr_xpos_hi[k], v5) - mirror_current_layer1_xpos;\n"
        "  if (g_widescreen_extra ? !WideExtSpriteVisible(boo_sx)\n"
        "                         : mextspr_xpos_hi[k] != (uint8)((v5 < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    return;\n",
    ),
    (
        "  oam->flags = sprites_tile_priority | (mextspr_xspeed[k] >> 1) & 0x40 ^ 0x40 | 0xF;\n"
        "  sprites_oamtile_size_buffer[v4 >> 2] = 2;\n",
        "  oam->flags = sprites_tile_priority | (mextspr_xspeed[k] >> 1) & 0x40 ^ 0x40 | 0xF;\n"
        "  sprites_oamtile_size_buffer[v4 >> 2] = 2 | (g_widescreen_extra ? (boo_sx >> 8) & 1 : 0);\n",
    ),
    # $028D4F/$028D97/$028DCA water splash (entry gate + spread-offset gate).
    (
        "  if (mextspr_xpos_hi[k] != (uint8)((mextspr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    goto LABEL_3;\n",
        "  uint16 wsplash_base = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  if (g_widescreen_extra ? !WideExtSpriteVisible(wsplash_base)\n"
        "                         : mextspr_xpos_hi[k] != (uint8)((mextspr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    goto LABEL_3;\n",
    ),
    (
        "  if ((uint8)(r0 + mextspr_xpos_lo[k] - mirror_current_layer1_xpos) >= 0xF0 ||\n",
        "  uint16 wsplash_sx = (uint16)(PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) + (int8)r0) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra ? !WideExtSpriteVisible(wsplash_sx)\n"
        "                          : (uint8)(r0 + mextspr_xpos_lo[k] - mirror_current_layer1_xpos) >= 0xF0) ||\n",
    ),
    (
        "    oam->flags = sprites_tile_priority | 2;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 2;\n",
        "    oam->flags = sprites_tile_priority | 2;\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 2 | (g_widescreen_extra ? (wsplash_sx >> 8) & 1 : 0);\n",
    ),
    # $028E23/$028E6D rip van fish 'zzz'.
    (
        "  uint8 v2 = kMinorExtendedSpriteOAMIndexes[k];\n"
        "  int8 v3 = mextspr_xpos_lo[k] - mirror_current_layer1_xpos;\n"
        "  if ((uint8)v3 < 8 || (uint8)v3 >= 0xFC ||\n",
        "  uint8 v2 = kMinorExtendedSpriteOAMIndexes[k];\n"
        "  int8 v3 = mextspr_xpos_lo[k] - mirror_current_layer1_xpos;\n"
        "  uint16 zzz_sx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra ? !WideExtSpriteVisible(zzz_sx) : ((uint8)v3 < 8 || (uint8)v3 >= 0xFC)) ||\n",
    ),
    (
        "    oam->charnum = v5;\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = 0;\n",
        "    oam->charnum = v5;\n"
        "    sprites_oamtile_size_buffer[v2 >> 2] = g_widescreen_extra ? (zzz_sx >> 8) & 1 : 0;\n",
    ),
    # $028E97 egg shell: rewritten gate — in widescreen the x test runs
    # BEFORE the OAM y write, fixing the vanilla garbage-tile design error
    # the wide-snes comment describes (4:3 keeps the vanilla order, bug
    # included).
    (
        "  OamEnt *oam;\n"
        "  uint8 v1;\n"
        "  if ((--mextspr_timer[k] & 0x3F) != 0 &&\n"
        "      (UpdateMinorExtendedSpritePosition_X(k), UpdateMinorExtendedSpritePosition_Y(k), ++mextspr_yspeed[k], ++mextspr_yspeed[k],\n"
        "       v1 = kMinorExtendedSpriteOAMIndexes[k], (uint8)(mextspr_ypos_lo[k] - mirror_current_layer1_ypos) < 0xF0) &&\n"
        "      (oam = get_OamEnt(oam_buf, v1), oam->ypos = mextspr_ypos_lo[k] - mirror_current_layer1_ypos,\n"
        "       (uint8)(mextspr_xpos_lo[k] - mirror_current_layer1_xpos) < 0xF8)) {\n"
        "    oam->xpos = mextspr_xpos_lo[k] - mirror_current_layer1_xpos;\n"
        "    oam->charnum = 111;\n"
        "    oam->flags = sprites_tile_priority | mextspr_timer[k] & 0xC0 | 3;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = 0;\n",
        "  OamEnt *oam;\n"
        "  uint8 v1;\n"
        "  uint16 egg_sx;\n"
        "  if ((--mextspr_timer[k] & 0x3F) != 0 &&\n"
        "      (UpdateMinorExtendedSpritePosition_X(k), UpdateMinorExtendedSpritePosition_Y(k), ++mextspr_yspeed[k], ++mextspr_yspeed[k],\n"
        "       v1 = kMinorExtendedSpriteOAMIndexes[k], (uint8)(mextspr_ypos_lo[k] - mirror_current_layer1_ypos) < 0xF0) &&\n"
        "      (oam = get_OamEnt(oam_buf, v1),\n"
        "       egg_sx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos,\n"
        "       g_widescreen_extra\n"
        "           ? ((int16)egg_sx >= -(int16)(g_widescreen_extra + 8) &&\n"
        "              (int16)egg_sx < 0x100 + (int16)g_widescreen_extra &&\n"
        "              (oam->ypos = mextspr_ypos_lo[k] - mirror_current_layer1_ypos, 1))\n"
        "           : (oam->ypos = mextspr_ypos_lo[k] - mirror_current_layer1_ypos,\n"
        "              (uint8)(mextspr_xpos_lo[k] - mirror_current_layer1_xpos) < 0xF8))) {\n"
        "    oam->xpos = mextspr_xpos_lo[k] - mirror_current_layer1_xpos;\n"
        "    oam->charnum = 111;\n"
        "    oam->flags = sprites_tile_priority | mextspr_timer[k] & 0xC0 | 3;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = g_widescreen_extra ? (egg_sx >> 8) & 1 : 0;\n",
    ),
    # $028EE4/$028F25 small star / glitter.
    (
        "  if ((uint8)(mextspr_xpos_lo[k] - mirror_current_layer1_xpos) < 0xF0 &&\n"
        "      (oam = get_OamEnt(oam_buf, v1), oam->xpos = mextspr_xpos_lo[k] - mirror_current_layer1_xpos,\n",
        "  uint16 star_sx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra ? WideExtSpriteVisible(star_sx)\n"
        "                          : (uint8)(mextspr_xpos_lo[k] - mirror_current_layer1_xpos) < 0xF0) &&\n"
        "      (oam = get_OamEnt(oam_buf, v1), oam->xpos = mextspr_xpos_lo[k] - mirror_current_layer1_xpos,\n",
    ),
    (
        "    oam->flags = sprites_tile_priority | 6;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = 0;\n",
        "    oam->flags = sprites_tile_priority | 6;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = g_widescreen_extra ? (star_sx >> 8) & 1 : 0;\n",
    ),
    # $028F2F/$028F81 podoboo flames.
    (
        "void MExtSpr04_PodobooFire(uint8 k) {  // 028f2f\n"
        "  if (mextspr_xpos_hi[k] != (uint8)((mextspr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) ||\n"
        "      !mextspr_timer[k]) {\n",
        "void MExtSpr04_PodobooFire(uint8 k) {  // 028f2f\n"
        "  uint16 pfire_sx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  if ((g_widescreen_extra\n"
        "           ? !WideExtSpriteVisible(pfire_sx)\n"
        "           : mextspr_xpos_hi[k] != (uint8)((mextspr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos))) ||\n"
        "      !mextspr_timer[k]) {\n",
    ),
    (
        "    oam->charnum = kMExtSpr04_PodobooFire_Tiles[mextspr_timer[k] >> 3];\n"
        "    oam->flags = sprites_tile_priority | 5;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = 0;\n",
        "    oam->charnum = kMExtSpr04_PodobooFire_Tiles[mextspr_timer[k] >> 3];\n"
        "    oam->flags = sprites_tile_priority | 5;\n"
        "    sprites_oamtile_size_buffer[v1 >> 2] = g_widescreen_extra ? (pfire_sx >> 8) & 1 : 0;\n",
    ),
    # $028FED/$029027 brick pieces (already 16-bit in C; widen gate + MSB).
    (
        "  uint16 tx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  uint8 r1 = tx;\n"
        "  if ((tx >> 8) || (oam = get_OamEnt(oam_buf, v8), oam->xpos = tx, r0 >= 0xF0)) {\n",
        "  uint16 tx = PAIR16(mextspr_xpos_hi[k], mextspr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  uint8 r1 = tx;\n"
        "  if ((g_widescreen_extra ? !WideExtSpriteVisible(tx) : (tx >> 8) != 0) ||\n"
        "      (oam = get_OamEnt(oam_buf, v8), oam->xpos = tx, r0 >= 0xF0)) {\n",
    ),
    (
        "  oam->flags = sprites_tile_priority | kMExtSpr01_BrickPiece_Flip[v11] ^ v12;\n"
        "  sprites_oamtile_size_buffer[v8 >> 2] = 0;\n",
        "  oam->flags = sprites_tile_priority | kMExtSpr01_BrickPiece_Flip[v11] ^ v12;\n"
        "  sprites_oamtile_size_buffer[v8 >> 2] = g_widescreen_extra ? (tx >> 8) & 1 : 0;\n",
    ),
])

# --- step 3, iteration 6: rest of level_sprites.asm --------------------------
# Yoshi wings, lakitu cloud face, magikoopa wand, net door, wall
# springboard, and the "$7F checks" (player screen-x high byte gates).
# Dry bones stays deferred (see session log).

patch_file("src/smw_01.c", [
    # $01E963/$01E97F: lakitu cloud face tile MSB = sprite wide flag XOR the
    # carry of the face's +4 x displacement.
    (
        "      v7[2].flags = 57;\n"
        "      sprites_oamtile_size_buffer[2] = 0;\n",
        "      v7[2].flags = 57;\n"
        "      sprites_oamtile_size_buffer[2] = g_widescreen_extra\n"
        "          ? (uint8)(g_sprite_wide_flag[v6] ^ ((uint8)temp14b0 >= 252)) : 0;\n",
    ),
    # $01BED8/$01BF0D: magikoopa wand MSB = bit 8 of its 16-bit screen x
    # (vanilla stored the offscreen flag, i.e. the hide trick).
    (
        "    sprites_oamtile_size_buffer[(v3 >> 2) + 66] = spr_xoffscreen_flag[k];\n",
        "    sprites_oamtile_size_buffer[(v3 >> 2) + 66] = g_widescreen_extra\n"
        "        ? (uint8)((uint16)(GetSprXPos(k) + (int8)kSpr01F_MagiKoopa_WandXDisp[spr_table157c[k]] -\n"
        "                           mirror_current_layer1_xpos) >> 8) & 1\n"
        "        : spr_xoffscreen_flag[k];\n",
    ),
    # $01BC06/$01BC11: net door unused tiles were hidden with MSB=1 (size 3),
    # which now shows them in the extensions; trash their ypos instead.
    # Buffer slot s maps to OAM entry get_OamEnt(oam_buf, 4*(s-64))[64].
    (
        "    if (v13) {\n"
        "      if (v13 == 2) {\n"
        "        sprites_oamtile_size_buffer[79] = 3;\n"
        "        sprites_oamtile_size_buffer[80] = 3;\n"
        "        sprites_oamtile_size_buffer[81] = 3;\n"
        "      }\n"
        "      sprites_oamtile_size_buffer[82] = 3;\n"
        "      sprites_oamtile_size_buffer[83] = 3;\n"
        "      sprites_oamtile_size_buffer[84] = 3;\n"
        "    }\n",
        "    if (v13) {\n"
        "      if (v13 == 2) {\n"
        "        if (g_widescreen_extra) {\n"
        "          get_OamEnt(oam_buf, 60)[64].ypos = -16;\n"
        "          get_OamEnt(oam_buf, 64)[64].ypos = -16;\n"
        "          get_OamEnt(oam_buf, 68)[64].ypos = -16;\n"
        "        } else {\n"
        "          sprites_oamtile_size_buffer[79] = 3;\n"
        "          sprites_oamtile_size_buffer[80] = 3;\n"
        "          sprites_oamtile_size_buffer[81] = 3;\n"
        "        }\n"
        "      }\n"
        "      if (g_widescreen_extra) {\n"
        "        get_OamEnt(oam_buf, 72)[64].ypos = -16;\n"
        "        get_OamEnt(oam_buf, 76)[64].ypos = -16;\n"
        "        get_OamEnt(oam_buf, 80)[64].ypos = -16;\n"
        "      } else {\n"
        "        sprites_oamtile_size_buffer[82] = 3;\n"
        "        sprites_oamtile_size_buffer[83] = 3;\n"
        "        sprites_oamtile_size_buffer[84] = 3;\n"
        "      }\n"
        "    }\n",
    ),
])

patch_file("src/smw_02.c", [
    # $02BB50/$02BB7F: yoshi wings, same pattern as koopa wings.
    (
        "    oam->xpos = t;\n"
        "    if (t < 256) {\n"
        "      oam->ypos = kSpr035_Yoshi_DATA_02BB13[v2] + r1 - mirror_current_layer1_ypos;\n"
        "      oam->charnum = kSpr035_Yoshi_Tiles[v2];\n"
        "      oam->flags = kSpr035_Yoshi_Prop[v2] | sprites_tile_priority;\n"
        "      sprites_oamtile_size_buffer[0xF8 >> 2] = kSpr035_Yoshi_TileSize[v2];\n"
        "    }\n",
        "    oam->xpos = t;\n"
        "    bool wing_visible = g_widescreen_extra\n"
        "        ? (int16)t >= -(int16)(g_widescreen_extra + 0x10) &&\n"
        "          (int16)t < 0x100 + (int16)g_widescreen_extra\n"
        "        : t < 256;\n"
        "    if (wing_visible) {\n"
        "      oam->ypos = kSpr035_Yoshi_DATA_02BB13[v2] + r1 - mirror_current_layer1_ypos;\n"
        "      oam->charnum = kSpr035_Yoshi_Tiles[v2];\n"
        "      oam->flags = kSpr035_Yoshi_Prop[v2] | sprites_tile_priority;\n"
        "      sprites_oamtile_size_buffer[0xF8 >> 2] =\n"
        "          kSpr035_Yoshi_TileSize[v2] | (g_widescreen_extra ? (t >> 8) & 1 : 0);\n"
        "    }\n",
    ),
    # $02CF5A ($7F check) in the wall springboard collision gate.
    (
        "  if (!player_current_state &&\n"
        "      !(spr_yoffscreen_flag[k] | (uint8)(spr_xoffscreen_flag[k] | HIBYTE(player_on_screen_pos_x) | HIBYTE(player_on_screen_pos_y)))) {\n",
        "  if (!player_current_state &&\n"
        "      !(spr_yoffscreen_flag[k] | (uint8)(spr_xoffscreen_flag[k] |\n"
        "        (g_widescreen_extra ? 0 : HIBYTE(player_on_screen_pos_x)) | HIBYTE(player_on_screen_pos_y)))) {\n",
    ),
    # $02CF82 pea_decide_horizontally: the 8-bit tile-vs-player distance can
    # false-positive across 256px wraps in widescreen. wide-snes re-verifies
    # with sprite_x - player_x + per-tile-dx in 16 bits; the dx is not
    # reconstructable at this site, so use a coarse +-0x40 proximity guard
    # (never rejects a true positive; kills the wrap ghosts).
    (
        "    if ((uint8)(oam[64].xpos - r10 + 8) < 0x14) {\n",
        "    if ((uint8)(oam[64].xpos - r10 + 8) < 0x14 &&\n"
        "        (!g_widescreen_extra || (uint16)(GetSprXPos(k) - player_xpos + 0x40) < 0x80)) {\n",
    ),
    # $028AF5 ($7F check) in the star-power sparkles gate.
    (
        "  if (!(HIBYTE(player_on_screen_pos_y) | (uint8)(HIBYTE(player_on_screen_pos_x) | v0)) && (uint8)player_on_screen_pos_y < 0xD0) {\n",
        "  if (!(HIBYTE(player_on_screen_pos_y) |\n"
        "        (uint8)((g_widescreen_extra ? 0 : HIBYTE(player_on_screen_pos_x)) | v0)) &&\n"
        "      (uint8)player_on_screen_pos_y < 0xD0) {\n",
    ),
])

patch_file("src/smw_00.c", [
    # $00FD5A ($7F check): coin glitter effect.
    (
        "void SpawnGlitterEffectForCoin() {  // 00fd5a\n"
        "  if (!(HIBYTE(player_on_screen_pos_y) | HIBYTE(player_on_screen_pos_x))) {\n",
        "void SpawnGlitterEffectForCoin() {  // 00fd5a\n"
        "  if (!(HIBYTE(player_on_screen_pos_y) |\n"
        "        (g_widescreen_extra ? 0 : HIBYTE(player_on_screen_pos_x)))) {\n",
    ),
    # $00FE50 ($7F check): turn-around smoke.
    (
        "  if (!(flag_sprites_locked | HIBYTE(player_on_screen_pos_y) | HIBYTE(player_on_screen_pos_x) | player_in_air_flag |\n",
        "  if (!(flag_sprites_locked | HIBYTE(player_on_screen_pos_y) |\n"
        "        (g_widescreen_extra ? 0 : HIBYTE(player_on_screen_pos_x)) | player_in_air_flag |\n",
    ),
])

print("patch-smw-widescreen: ppu.h, ppu.c, config.c, main.c, smw_rtl.h, smw_00/01/02/03/05.c patched OK")
