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
    # $05D923 horz_customizer is deliberately NOT ported. wide-snes pins the
    # camera to 0x100 (top secret $003 / big boo $0E4 / yoshi's house $104)
    # or 0x400 (wendy $0D3 / lemmy $1F2 / cloud $1C9) and disables scroll
    # ($FA ghost bonus) because on hardware the SNES tilemap wraps mod 512
    # and those pins center the fixed view inside the force-rendered buffer.
    # Every one of those rooms is a 1-screen level (ROM header screens == 1),
    # and this port's 1-screen path (camera pinned to 0 in the $00F73F clamp
    # + force_whole_render below) already produces the same centered wrapped
    # view with the camera where Mario actually is. Porting the pin verbatim
    # put the camera a screen away from Mario's entrance (px 0x80, camera
    # 0x100) and the widened $00E9A1 camera-kill check killed him on entry —
    # the "TIME UP!" on entering Yoshi's House ($104).
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

# --- step 3, iteration 10: smoke_position -------------------------------------
# smoke_position.asm (the MarioE/Tattletale patch wide-snes bundles): smoke
# sprites only carry 8-bit x/y, wrapping at the old 256px window. Hi-byte
# tables go in the same free RAM the ASM uses (unused in the C port too), so
# savestates carry them. Hi-table writes are unconditional (nothing reads
# them in 4:3); every behavior change stays keyed on g_widescreen_extra.

patch_file("src/variables.h", [
    (
        "#define smoke_spr_timer ((uint8*)(g_ram+0x17CC))\n",
        "#define smoke_spr_timer ((uint8*)(g_ram+0x17CC))\n"
        "// Widescreen (wide-snes smoke_position.asm): smoke x/y high bytes, in the\n"
        "// same free-RAM slots the ASM patch uses so savestates carry them.\n"
        "#define smoke_spr_ypos_hi ((uint8*)(g_ram+0x18C5))\n"
        "#define smoke_spr_xpos_hi ((uint8*)(g_ram+0x18C9))\n",
    ),
])

# $0285DB minor_store_spr_x_star: SpawnSparkles takes a 16-bit x now.
patch_file("src/funcs.h", [
    (
        "void SpawnSparkles(uint8 r0, uint8 r2);\n",
        "void SpawnSparkles(uint8 r0, uint16 r2);\n",
    ),
])

patch_file("src/smw_00.c", [
    # $00FB9E SetEndLevelHighBytes (goal tape power-up puff).
    (
        "  smoke_spr_spriteid[v4] = 1;\n"
        "  smoke_spr_ypos_lo[v4] = spr_ypos_lo[j];\n"
        "  smoke_spr_xpos_lo[v4] = spr_xpos_lo[j];\n"
        "  smoke_spr_timer[v4] = 27;\n",
        "  smoke_spr_spriteid[v4] = 1;\n"
        "  smoke_spr_ypos_lo[v4] = spr_ypos_lo[j];\n"
        "  smoke_spr_xpos_lo[v4] = spr_xpos_lo[j];\n"
        "  smoke_spr_ypos_hi[v4] = spr_ypos_hi[j];\n"
        "  smoke_spr_xpos_hi[v4] = spr_xpos_hi[j];\n"
        "  smoke_spr_timer[v4] = 27;\n",
    ),
    # $00FD7E midway/yoshi-coin glitter: hi bytes, layer-2 branch 16-bit.
    (
        "    smoke_spr_spriteid[v0] = 5;\n"
        "    smoke_spr_xpos_lo[v0] = blocks_xpos & 0xF0;\n"
        "    smoke_spr_ypos_lo[v0] = blocks_ypos & 0xF0;\n"
        "    if ((uint8)misc_current_layer_being_processed) {\n"
        "      smoke_spr_xpos_lo[v0] = (blocks_xpos - misc_second_level_layer_xpos) & 0xF0;\n"
        "      smoke_spr_ypos_lo[v0] = (blocks_ypos - misc_second_level_layer_ypos) & 0xF0;\n"
        "    }\n",
        "    smoke_spr_spriteid[v0] = 5;\n"
        "    smoke_spr_xpos_lo[v0] = blocks_xpos & 0xF0;\n"
        "    smoke_spr_ypos_lo[v0] = blocks_ypos & 0xF0;\n"
        "    smoke_spr_xpos_hi[v0] = HIBYTE(blocks_xpos);\n"
        "    smoke_spr_ypos_hi[v0] = HIBYTE(blocks_ypos);\n"
        "    if ((uint8)misc_current_layer_being_processed) {\n"
        "      uint16 gx = blocks_xpos - misc_second_level_layer_xpos;\n"
        "      uint16 gy = blocks_ypos - misc_second_level_layer_ypos;\n"
        "      smoke_spr_xpos_lo[v0] = gx & 0xF0;\n"
        "      smoke_spr_ypos_lo[v0] = gy & 0xF0;\n"
        "      smoke_spr_xpos_hi[v0] = gx >> 8;\n"
        "      smoke_spr_ypos_hi[v0] = gy >> 8;\n"
        "    }\n",
    ),
    # $00FE8E player turn-around smoke: 16-bit player position + disp.
    (
        "void SpawnPlayerTurnAroundSmoke_00FE72(uint8 j) {  // 00fe72\n"
        "  smoke_spr_spriteid[j] = 3;\n"
        "  smoke_spr_xpos_lo[j] = player_xpos + 4;\n"
        "  smoke_spr_ypos_lo[j] = player_ypos + 26 + (player_riding_yoshi_flag ? 16 : 0);\n"
        "  smoke_spr_timer[j] = 19;\n"
        "}\n",
        "void SpawnPlayerTurnAroundSmoke_00FE72(uint8 j) {  // 00fe72\n"
        "  uint16 sx = player_xpos + 4;\n"
        "  uint16 sy = player_ypos + 26 + (player_riding_yoshi_flag ? 16 : 0);\n"
        "  smoke_spr_spriteid[j] = 3;\n"
        "  smoke_spr_xpos_lo[j] = sx;\n"
        "  smoke_spr_ypos_lo[j] = sy;\n"
        "  smoke_spr_xpos_hi[j] = sx >> 8;\n"
        "  smoke_spr_ypos_hi[j] = sy >> 8;\n"
        "  smoke_spr_timer[j] = 19;\n"
        "}\n",
    ),
])

patch_file("src/smw_01.c", [
    # $018078 generic sprite smoke: FixHighX/Y's pseudo-subtraction is just
    # a sign-extended 16-bit add (motors pass a negative r0).
    (
        "    smoke_spr_spriteid[j] = 3;\n"
        "    smoke_spr_xpos_lo[j] = r0 + spr_xpos_lo[k];\n"
        "    smoke_spr_ypos_lo[j] = r1 + spr_ypos_lo[k];\n"
        "    smoke_spr_timer[j] = 19;\n",
        "    smoke_spr_spriteid[j] = 3;\n"
        "    uint16 sx = GetSprXPos(k) + (int8)r0;\n"
        "    uint16 sy = GetSprYPos(k) + (int8)r1;\n"
        "    smoke_spr_xpos_lo[j] = sx;\n"
        "    smoke_spr_ypos_lo[j] = sy;\n"
        "    smoke_spr_xpos_hi[j] = sx >> 8;\n"
        "    smoke_spr_ypos_hi[j] = sy >> 8;\n"
        "    smoke_spr_timer[j] = 19;\n",
    ),
    # $01AB8D sprite-hit contact effect.
    (
        "    smoke_spr_spriteid[j] = 2;\n"
        "    smoke_spr_xpos_lo[j] = spr_xpos_lo[k];\n"
        "    smoke_spr_ypos_lo[j] = spr_ypos_lo[k];\n"
        "    smoke_spr_timer[j] = 8;\n",
        "    smoke_spr_spriteid[j] = 2;\n"
        "    smoke_spr_xpos_lo[j] = spr_xpos_lo[k];\n"
        "    smoke_spr_ypos_lo[j] = spr_ypos_lo[k];\n"
        "    smoke_spr_xpos_hi[j] = spr_xpos_hi[k];\n"
        "    smoke_spr_ypos_hi[j] = spr_ypos_hi[k];\n"
        "    smoke_spr_timer[j] = 8;\n",
    ),
    # $01ABC5 contact effect at the player's position.
    (
        "    smoke_spr_spriteid[j] = 2;\n"
        "    smoke_spr_xpos_lo[j] = player_xpos;\n"
        "    smoke_spr_ypos_lo[j] = player_ypos + (player_riding_yoshi_flag ? 30 : 20);\n"
        "    smoke_spr_timer[j] = 8;\n",
        "    smoke_spr_spriteid[j] = 2;\n"
        "    uint16 sy = player_ypos + (player_riding_yoshi_flag ? 30 : 20);\n"
        "    smoke_spr_xpos_lo[j] = player_xpos;\n"
        "    smoke_spr_ypos_lo[j] = sy;\n"
        "    smoke_spr_xpos_hi[j] = HIBYTE(player_xpos);\n"
        "    smoke_spr_ypos_hi[j] = sy >> 8;\n"
        "    smoke_spr_timer[j] = 8;\n",
    ),
    # $01BDAD magikoopa smoke.
    (
        "  smoke_spr_spriteid[v1] = 1;\n"
        "  smoke_spr_xpos_lo[v1] = spr_xpos_lo[k];\n"
        "  smoke_spr_ypos_lo[v1] = spr_ypos_lo[k];\n"
        "  smoke_spr_timer[v1] = 27;\n",
        "  smoke_spr_spriteid[v1] = 1;\n"
        "  smoke_spr_xpos_lo[v1] = spr_xpos_lo[k];\n"
        "  smoke_spr_ypos_lo[v1] = spr_ypos_lo[k];\n"
        "  smoke_spr_xpos_hi[v1] = spr_xpos_hi[k];\n"
        "  smoke_spr_ypos_hi[v1] = spr_ypos_hi[k];\n"
        "  smoke_spr_timer[v1] = 27;\n",
    ),
    # $01C505 power-up collect glitter.
    (
        "  smoke_spr_spriteid[v1] = 5;\n"
        "  smoke_spr_xpos_lo[v1] = spr_xpos_lo[k];\n"
        "  smoke_spr_ypos_lo[v1] = spr_ypos_lo[k];\n"
        "  smoke_spr_timer[v1] = 16;\n",
        "  smoke_spr_spriteid[v1] = 5;\n"
        "  smoke_spr_xpos_lo[v1] = spr_xpos_lo[k];\n"
        "  smoke_spr_ypos_lo[v1] = spr_ypos_lo[k];\n"
        "  smoke_spr_xpos_hi[v1] = spr_xpos_hi[k];\n"
        "  smoke_spr_ypos_hi[v1] = spr_ypos_hi[k];\n"
        "  smoke_spr_timer[v1] = 16;\n",
    ),
    # $01C5E6 feather freeze (mario becomes smoke).
    (
        "    smoke_spr_spriteid[v0] = -127;\n"
        "    smoke_spr_timer[v0] = 27;\n"
        "    smoke_spr_ypos_lo[v0] = player_ypos + 8;\n"
        "    smoke_spr_xpos_lo[v0] = player_xpos;\n",
        "    smoke_spr_spriteid[v0] = -127;\n"
        "    smoke_spr_timer[v0] = 27;\n"
        "    uint16 sy = player_ypos + 8;\n"
        "    smoke_spr_ypos_lo[v0] = sy;\n"
        "    smoke_spr_xpos_lo[v0] = player_xpos;\n"
        "    smoke_spr_ypos_hi[v0] = sy >> 8;\n"
        "    smoke_spr_xpos_hi[v0] = HIBYTE(player_xpos);\n",
    ),
    # $01D026 Morton/Roy/Ludwig death smoke.
    (
        "      smoke_spr_spriteid[0] = 1;\n"
        "      smoke_spr_xpos_lo[0] = spr_xpos_lo[k] - 8;\n"
        "      smoke_spr_ypos_lo[0] = spr_ypos_lo[k] + 8;\n"
        "      smoke_spr_timer[0] = 27;\n",
        "      uint16 sx = GetSprXPos(k) - 8;\n"
        "      uint16 sy = GetSprYPos(k) + 8;\n"
        "      smoke_spr_spriteid[0] = 1;\n"
        "      smoke_spr_xpos_lo[0] = sx;\n"
        "      smoke_spr_ypos_lo[0] = sy;\n"
        "      smoke_spr_xpos_hi[0] = sx >> 8;\n"
        "      smoke_spr_ypos_hi[0] = sy >> 8;\n"
        "      smoke_spr_timer[0] = 27;\n",
    ),
    # $01B170 sparkle spawn window (deferred from iteration 9): skip the
    # 256px window in widescreen (the ASM BRAs over it) and pass 16-bit x.
    (
        "    int8 v3 = (GetRand() & 0xF) - 4;\n"
        "    uint16 x = GetSprXPos(k) + v3;\n"
        "    uint8 r2 = x;\n"
        "    if ((uint16)(x - mirror_current_layer1_xpos) < 256) {\n"
        "      uint8 v5 = (misc_random_byte2 & 0xF) - 2;  // not signed?\n"
        "      uint16 r0w = GetSprYPos(k) + v5;\n"
        "      SpawnSparkles(r0w, r2);\n"
        "    }\n",
        "    int8 v3 = (GetRand() & 0xF) - 4;\n"
        "    uint16 x = GetSprXPos(k) + v3;\n"
        "    if (g_widescreen_extra || (uint16)(x - mirror_current_layer1_xpos) < 256) {\n"
        "      uint8 v5 = (misc_random_byte2 & 0xF) - 2;  // not signed?\n"
        "      uint16 r0w = GetSprYPos(k) + v5;\n"
        "      SpawnSparkles(r0w, x);\n"
        "    }\n",
    ),
])

patch_file("src/smw_02.c", [
    # $028A61 reznor bridge / sumo bro smoke.
    (
        "  smoke_spr_spriteid[v0] = 1;\n"
        "  smoke_spr_ypos_lo[v0] = blocks_ypos;\n"
        "  smoke_spr_xpos_lo[v0] = blocks_xpos;\n"
        "  smoke_spr_timer[v0] = 27;\n",
        "  smoke_spr_spriteid[v0] = 1;\n"
        "  smoke_spr_ypos_lo[v0] = blocks_ypos;\n"
        "  smoke_spr_xpos_lo[v0] = blocks_xpos;\n"
        "  smoke_spr_ypos_hi[v0] = HIBYTE(blocks_ypos);\n"
        "  smoke_spr_xpos_hi[v0] = HIBYTE(blocks_xpos);\n"
        "  smoke_spr_timer[v0] = 27;\n",
    ),
    # $029AEA spinning-coin glitter: 16-bit from the block_coin hi tables;
    # the layer-2 subtraction keeps the C port's lo-byte math exactly.
    (
        "  smoke_spr_spriteid[v1] = 5;\n"
        "  uint8 t = block_coin_spr_layer_index[k];\n"
        "  uint8 v2 = block_coin_spr_xpos_lo[k];\n"
        "  if (t & 1)\n"
        "    v2 -= misc_second_level_layer_xpos + 1;\n"
        "  smoke_spr_xpos_lo[v1] = v2;\n"
        "  uint8 v3 = block_coin_spr_ypos_lo[k];\n"
        "  if (t & 1)\n"
        "    v3 -= misc_second_level_layer_ypos + 1;\n"
        "  smoke_spr_ypos_lo[v1] = v3;\n"
        "  smoke_spr_timer[v1] = 16;\n",
        "  smoke_spr_spriteid[v1] = 5;\n"
        "  uint8 t = block_coin_spr_layer_index[k];\n"
        "  uint16 sx = PAIR16(block_coin_spr_xpos_hi[k], block_coin_spr_xpos_lo[k]);\n"
        "  uint16 sy = PAIR16(block_coin_spr_ypos_hi[k], block_coin_spr_ypos_lo[k]);\n"
        "  if (t & 1) {\n"
        "    sx -= misc_second_level_layer_xpos + 1;\n"
        "    sy -= misc_second_level_layer_ypos + 1;\n"
        "  }\n"
        "  smoke_spr_xpos_lo[v1] = sx;\n"
        "  smoke_spr_ypos_lo[v1] = sy;\n"
        "  smoke_spr_xpos_hi[v1] = sx >> 8;\n"
        "  smoke_spr_ypos_hi[v1] = sy >> 8;\n"
        "  smoke_spr_timer[v1] = 16;\n",
    ),
    # $02A438 pink-berry cloud coin glitter.
    (
        "        smoke_spr_spriteid[v1] = 5;\n"
        "        smoke_spr_xpos_lo[v1] = ext_spr_xpos_lo[k];\n"
        "        smoke_spr_ypos_lo[v1] = ext_spr_ypos_lo[k];\n"
        "        smoke_spr_timer[v1] = 10;\n",
        "        smoke_spr_spriteid[v1] = 5;\n"
        "        smoke_spr_xpos_lo[v1] = ext_spr_xpos_lo[k];\n"
        "        smoke_spr_ypos_lo[v1] = ext_spr_ypos_lo[k];\n"
        "        smoke_spr_xpos_hi[v1] = ext_spr_xpos_hi[k];\n"
        "        smoke_spr_ypos_hi[v1] = ext_spr_ypos_hi[k];\n"
        "        smoke_spr_timer[v1] = 10;\n",
    ),
    # $02B513 bulletbill-shooter smoke: 16-bit shooter x + signed disp
    # (0xF4 = -12; the ASM's DEX/TXA sign trick).
    (
        "  smoke_spr_spriteid[v1] = 1;\n"
        "  smoke_spr_ypos_lo[v1] = shooter_spr_ypos_lo[k];\n"
        "  smoke_spr_timer[v1] = 27;\n"
        "  smoke_spr_xpos_lo[v1] =\n"
        "      kShooterSpr01_BulletBillShooter_ShooterSmokeDispX[HIBYTE(player_xpos) >= ((uint8)player_xpos < shooter_spr_xpos_lo[k]) + shooter_spr_xpos_hi[k]] +\n"
        "      shooter_spr_xpos_lo[k];\n",
        "  smoke_spr_spriteid[v1] = 1;\n"
        "  smoke_spr_ypos_lo[v1] = shooter_spr_ypos_lo[k];\n"
        "  smoke_spr_ypos_hi[v1] = shooter_spr_ypos_hi[k];\n"
        "  smoke_spr_timer[v1] = 27;\n"
        "  uint16 sx = PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) +\n"
        "      (int8)kShooterSpr01_BulletBillShooter_ShooterSmokeDispX[HIBYTE(player_xpos) >= ((uint8)player_xpos < shooter_spr_xpos_lo[k]) + shooter_spr_xpos_hi[k]];\n"
        "  smoke_spr_xpos_lo[v1] = sx;\n"
        "  smoke_spr_xpos_hi[v1] = sx >> 8;\n",
    ),
    # $02B969 torpedo ted trail: the ASM rewrite drops the on-screen spawn
    # gate entirely (the draw-side check_x culls now).
    (
        "  uint16 t = t1 - mirror_current_layer1_xpos;\n"
        "  if (t < 256) {\n"
        "    smoke_spr_spriteid[j] = 1;\n"
        "    smoke_spr_xpos_lo[j] = t1;\n"
        "    smoke_spr_ypos_lo[j] = spr_ypos_lo[k];\n"
        "    smoke_spr_timer[j] = 15;\n"
        "  }\n",
        "  uint16 t = t1 - mirror_current_layer1_xpos;\n"
        "  if (g_widescreen_extra || t < 256) {\n"
        "    smoke_spr_spriteid[j] = 1;\n"
        "    smoke_spr_xpos_lo[j] = t1;\n"
        "    smoke_spr_ypos_lo[j] = spr_ypos_lo[k];\n"
        "    smoke_spr_xpos_hi[j] = t1 >> 8;\n"
        "    smoke_spr_ypos_hi[j] = spr_ypos_hi[k];\n"
        "    smoke_spr_timer[j] = 15;\n"
        "  }\n",
    ),
    # $0285B6 minor_load_spr_x_star: star-power sparkles, 16-bit x with the
    # sign-extended random offset.
    (
        "  uint8 r0 = player_ypos + r1 + (misc_random_byte1 & v0);\n"
        "  uint8 r2 = player_xpos + (misc_random_byte2 & 0xF) - 2;\n"
        "  SpawnSparkles(r0, r2);\n",
        "  uint8 r0 = player_ypos + r1 + (misc_random_byte1 & v0);\n"
        "  uint16 r2 = player_xpos + (int8)((misc_random_byte2 & 0xF) - 2);\n"
        "  SpawnSparkles(r0, r2);\n",
    ),
    # $0285DB minor_store_spr_x_star: store the sparkle's x hi byte.
    (
        "void SpawnSparkles(uint8 r0, uint8 r2) {  // 0285ba\n",
        "void SpawnSparkles(uint8 r0, uint16 r2) {  // 0285ba\n",
    ),
    (
        "  mextspr_spriteid[v0] = 5;\n"
        "  mextspr_yspeed[v0] = 0;\n"
        "  mextspr_ypos_lo[v0] = r0;\n"
        "  mextspr_xpos_lo[v0] = r2;\n"
        "  mextspr_timer[v0] = 23;\n",
        "  mextspr_spriteid[v0] = 5;\n"
        "  mextspr_yspeed[v0] = 0;\n"
        "  mextspr_ypos_lo[v0] = r0;\n"
        "  mextspr_xpos_lo[v0] = r2;\n"
        "  if (g_widescreen_extra)\n"
        "    mextspr_xpos_hi[v0] = r2 >> 8;\n"
        "  mextspr_timer[v0] = 23;\n",
    ),
    # $0296C0 draw rewrite, puff: 16-bit check_x/check_y; y-offscreen no
    # longer erases (the smoke lives until its timer runs out), x never
    # culls — the OAM MSB (CMP #$0100 carry) places/hides the tile.
    (
        "void SmokeSpr01_PuffOfSmoke(uint8 k) {  // 0296e3\n"
        "  OamEnt *v2;\n"
        "  OamEnt *oam;\n"
        "\n"
        "  if (!smoke_spr_timer[k])\n"
        "    goto LABEL_10;\n",
        "static void WideSmokeSpr01_PuffOfSmoke(uint8 k) {\n"
        "  if (!smoke_spr_timer[k]) {\n"
        "    EraseSmokeSprite(k);\n"
        "    return;\n"
        "  }\n"
        "  if ((smoke_spr_spriteid[k] & 0x80) != 0 || !flag_sprites_locked)\n"
        "    --smoke_spr_timer[k];\n"
        "  uint16 sy = PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) - mirror_current_layer1_ypos;\n"
        "  if (sy >= 0xE0)\n"
        "    return;\n"
        "  uint16 sx = PAIR16(smoke_spr_xpos_hi[k], smoke_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  uint8 msb = sx >= 0x100;\n"
        "  if (spr_spriteid[7] == 0xA9 || (misc_nmito_use_flag & 0x40) == 0) {\n"
        "    uint8 v3 = kSmokeSpriteOAMIndexes_One[k];\n"
        "    OamEnt *oam = get_OamEnt(oam_buf, v3);\n"
        "    oam->xpos = sx;\n"
        "    oam->ypos = sy;\n"
        "    oam->flags = sprites_tile_priority;\n"
        "    oam->charnum = kSmokeSpr01_PuffOfSmoke_Tiles[smoke_spr_timer[k] >> 2];\n"
        "    sprites_oamtile_size_buffer[v3 >> 2] = 2 | msb;\n"
        "  } else {\n"
        "    uint8 v1 = kSmokeSpriteOAMIndexes_Two[k];\n"
        "    OamEnt *v2 = get_OamEnt(oam_buf, v1);\n"
        "    v2[64].xpos = sx;\n"
        "    v2[64].ypos = sy;\n"
        "    v2[64].flags = sprites_tile_priority;\n"
        "    v2[64].charnum = kSmokeSpr01_PuffOfSmoke_Tiles[smoke_spr_timer[k] >> 2];\n"
        "    sprites_oamtile_size_buffer[(v1 >> 2) + 64] = 2 | msb;\n"
        "  }\n"
        "}\n"
        "\n"
        "void SmokeSpr01_PuffOfSmoke(uint8 k) {  // 0296e3\n"
        "  OamEnt *v2;\n"
        "  OamEnt *oam;\n"
        "\n"
        "  if (g_widescreen_extra) {\n"
        "    WideSmokeSpr01_PuffOfSmoke(k);\n"
        "    return;\n"
        "  }\n"
        "  if (!smoke_spr_timer[k])\n"
        "    goto LABEL_10;\n",
    ),
    # $0296C0 draw rewrite, contact effect: per-tile MSB (left column vs
    # the +8 column), y gate 0xE0, no erase on offscreen.
    (
        "void SmokeSpr02_ContactEffect(uint8 k) {  // 029797\n"
        "  if (!smoke_spr_timer[k])\n"
        "    goto LABEL_2;\n",
        "static void WideSmokeSpr02_ContactEffect(uint8 k) {\n"
        "  if (!smoke_spr_timer[k]) {\n"
        "    EraseSmokeSprite(k);\n"
        "    return;\n"
        "  }\n"
        "  if (!flag_sprites_locked)\n"
        "    --smoke_spr_timer[k];\n"
        "  uint16 sy = PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) - mirror_current_layer1_ypos;\n"
        "  if (sy >= 0xE0)\n"
        "    return;\n"
        "  uint16 sx = PAIR16(smoke_spr_xpos_hi[k], smoke_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  uint8 msb_l = sx >= 0x100, msb_r = (uint16)(sx + 8) >= 0x100;\n"
        "  OamEnt *oam;\n"
        "  uint8 base;\n"
        "  if ((misc_nmito_use_flag & 0x40) != 0 && misc_nmito_use_flag != 0xC1) {\n"
        "    oam = get_OamEnt(oam_buf, 0x90) + 64;\n"
        "    base = 100;\n"
        "  } else {\n"
        "    oam = get_OamEnt(oam_buf, 0xF0);\n"
        "    base = 60;\n"
        "  }\n"
        "  oam[0].xpos = sx;\n"
        "  oam[2].xpos = sx;\n"
        "  oam[1].xpos = sx + 8;\n"
        "  oam[3].xpos = sx + 8;\n"
        "  oam[0].ypos = sy;\n"
        "  oam[1].ypos = sy;\n"
        "  oam[2].ypos = sy + 8;\n"
        "  oam[3].ypos = sy + 8;\n"
        "  int8 flags = sprites_tile_priority | (32 * smoke_spr_timer[k]) & 0x40;\n"
        "  oam[0].flags = flags;\n"
        "  oam[1].flags = flags;\n"
        "  flags ^= 0xC0;\n"
        "  oam[2].flags = flags;\n"
        "  oam[3].flags = flags;\n"
        "  if ((smoke_spr_timer[k] & 2) != 0) {\n"
        "    oam[0].charnum = 125;\n"
        "    oam[3].charnum = 125;\n"
        "    oam[1].charnum = 124;\n"
        "    oam[2].charnum = 124;\n"
        "  } else {\n"
        "    oam[0].charnum = 124;\n"
        "    oam[3].charnum = 124;\n"
        "    oam[1].charnum = 125;\n"
        "    oam[2].charnum = 125;\n"
        "  }\n"
        "  sprites_oamtile_size_buffer[base] = msb_l;\n"
        "  sprites_oamtile_size_buffer[base + 1] = msb_r;\n"
        "  sprites_oamtile_size_buffer[base + 2] = msb_l;\n"
        "  sprites_oamtile_size_buffer[base + 3] = msb_r;\n"
        "}\n"
        "\n"
        "void SmokeSpr02_ContactEffect(uint8 k) {  // 029797\n"
        "  if (g_widescreen_extra) {\n"
        "    WideSmokeSpr02_ContactEffect(k);\n"
        "    return;\n"
        "  }\n"
        "  if (!smoke_spr_timer[k])\n"
        "    goto LABEL_2;\n",
    ),
    # $0296C0 draw rewrite, skid: 16-bit rise (borrow into the hi byte),
    # same check_x/check_y treatment; single tile.
    (
        "void SmokeSpr03_TurnAroundSmoke(uint8 k) {  // 029927\n"
        "  uint8 v1 = smoke_spr_timer[k];\n"
        "  if (v1) {\n",
        "static void WideSmokeSpr03_TurnAroundSmoke(uint8 k) {\n"
        "  uint8 v1 = smoke_spr_timer[k];\n"
        "  if (!v1) {\n"
        "    if ((misc_nmito_use_flag & 0x40) != 0 && !flag_reznor_room_oamindex_timer)\n"
        "      get_OamEnt(oam_buf, kSmokeSpriteOAMIndexes_Two[k])[64].ypos = -16;\n"
        "    EraseSmokeSprite(k);\n"
        "    return;\n"
        "  }\n"
        "  if (!flag_sprites_locked) {\n"
        "    --smoke_spr_timer[k];\n"
        "    if ((v1 & 7) == 0) {\n"
        "      uint16 y16 = PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) - 1;\n"
        "      smoke_spr_ypos_lo[k] = y16;\n"
        "      smoke_spr_ypos_hi[k] = y16 >> 8;\n"
        "    }\n"
        "  }\n"
        "  uint16 sy = PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) - mirror_current_layer1_ypos;\n"
        "  if (sy >= 0xE0)\n"
        "    return;\n"
        "  uint16 sx = PAIR16(smoke_spr_xpos_hi[k], smoke_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "  uint8 msb = sx >= 0x100;\n"
        "  uint8 v2;\n"
        "  OamEnt *o;\n"
        "  uint8 sb;\n"
        "  if (spr_spriteid[7] == 0xA9 || flag_reznor_room_oamindex_timer || (misc_nmito_use_flag & 0x80) == 0) {\n"
        "    v2 = kSmokeSpriteOAMIndexes_One[k];\n"
        "    o = get_OamEnt(oam_buf, v2);\n"
        "    sb = v2 >> 2;\n"
        "  } else if (misc_nmito_use_flag != 0xC1 && (misc_nmito_use_flag & 0x40) != 0) {\n"
        "    v2 = kSmokeSpriteOAMIndexes_Two[k];\n"
        "    o = get_OamEnt(oam_buf, v2) + 64;\n"
        "    sb = (v2 >> 2) + 64;\n"
        "  } else {\n"
        "    v2 = kSmokeSpriteOAMIndexes_Two[k];\n"
        "    o = get_OamEnt(oam_buf, v2);\n"
        "    sb = v2 >> 2;\n"
        "  }\n"
        "  o->xpos = sx;\n"
        "  o->ypos = sy;\n"
        "  o->flags = sprites_tile_priority;\n"
        "  o->charnum = kSmokeSpr03_TurnAroundSmoke_Tiles[smoke_spr_timer[k] >> 2];\n"
        "  sprites_oamtile_size_buffer[sb] = msb;\n"
        "}\n"
        "\n"
        "void SmokeSpr03_TurnAroundSmoke(uint8 k) {  // 029927\n"
        "  if (g_widescreen_extra) {\n"
        "    WideSmokeSpr03_TurnAroundSmoke(k);\n"
        "    return;\n"
        "  }\n"
        "  uint8 v1 = smoke_spr_timer[k];\n"
        "  if (v1) {\n",
    ),
    # $0296C0 draw rewrite, glitter: the ASM adds check_x_wide + check_y
    # spawn gates and carries the smoke hi bytes (+offset carry) into the
    # sparkle. Also fixes an iter-9 hole: the sparkle draw reads
    # mextspr_xpos_hi but this spawn path only wrote the lo byte.
    (
        "      if ((v1 & 3) == 0) {\n"
        "        uint8 v2 = 11;\n"
        "        while (mextspr_spriteid[v2]) {\n",
        "      if ((v1 & 3) == 0) {\n"
        "        if (g_widescreen_extra) {\n"
        "          uint16 gx = PAIR16(smoke_spr_xpos_hi[k], smoke_spr_xpos_lo[k]) - mirror_current_layer1_xpos;\n"
        "          uint16 gy = PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) - mirror_current_layer1_ypos;\n"
        "          if ((int16)gx < -(int16)g_widescreen_extra ||\n"
        "              (int16)gx >= 0x100 + (int16)g_widescreen_extra || gy >= 0xE0)\n"
        "            return;\n"
        "        }\n"
        "        uint8 v2 = 11;\n"
        "        while (mextspr_spriteid[v2]) {\n",
    ),
    (
        "        mextspr_spriteid[v2] = 2;\n"
        "        uint8 r1 = smoke_spr_ypos_lo[k];\n"
        "        uint8 r0 = smoke_spr_xpos_lo[k];\n"
        "        uint8 v3 = (smoke_spr_timer[k] >> 2) & 3;\n"
        "        mextspr_xpos_lo[v2] = r0 + kSmokeSpr05_Glitter_DATA_0298C2[v3];\n"
        "        mextspr_ypos_lo[v2] = r1 + kSmokeSpr05_Glitter_DATA_0298C6[v3];\n"
        "        mextspr_timer[v2] = 23;\n",
        "        mextspr_spriteid[v2] = 2;\n"
        "        uint8 r1 = smoke_spr_ypos_lo[k];\n"
        "        uint8 r0 = smoke_spr_xpos_lo[k];\n"
        "        uint8 v3 = (smoke_spr_timer[k] >> 2) & 3;\n"
        "        mextspr_xpos_lo[v2] = r0 + kSmokeSpr05_Glitter_DATA_0298C2[v3];\n"
        "        mextspr_ypos_lo[v2] = r1 + kSmokeSpr05_Glitter_DATA_0298C6[v3];\n"
        "        if (g_widescreen_extra) {\n"
        "          mextspr_xpos_hi[v2] = (uint8)((PAIR16(smoke_spr_xpos_hi[k], smoke_spr_xpos_lo[k]) +\n"
        "                                         kSmokeSpr05_Glitter_DATA_0298C2[v3]) >> 8);\n"
        "          mextspr_ypos_hi[v2] = (uint8)((PAIR16(smoke_spr_ypos_hi[k], smoke_spr_ypos_lo[k]) +\n"
        "                                         (int8)kSmokeSpr05_Glitter_DATA_0298C6[v3]) >> 8);\n"
        "        }\n"
        "        mextspr_timer[v2] = 23;\n",
    ),
])

patch_file("src/smw_03.c", [
    # $038A2E blue koopa skid smoke (inlined copy of the generic routine).
    (
        "        smoke_spr_spriteid[v1] = 3;\n"
        "        smoke_spr_xpos_lo[v1] = r0 + spr_xpos_lo[k];\n"
        "        smoke_spr_ypos_lo[v1] = r1 + spr_ypos_lo[k];\n"
        "        smoke_spr_timer[v1] = 19;\n",
        "        smoke_spr_spriteid[v1] = 3;\n"
        "        uint16 sx = GetSprXPos(k) + (int8)r0;\n"
        "        uint16 sy = GetSprYPos(k) + (int8)r1;\n"
        "        smoke_spr_xpos_lo[v1] = sx;\n"
        "        smoke_spr_ypos_lo[v1] = sy;\n"
        "        smoke_spr_xpos_hi[v1] = sx >> 8;\n"
        "        smoke_spr_ypos_hi[v1] = sy >> 8;\n"
        "        smoke_spr_timer[v1] = 19;\n",
    ),
    # $03D76C reznor bridge smoke: skip the on-screen check in widescreen.
    (
        "void Spr0A9_Reznor_03D76C() {  // 03d76c\n"
        "  if ((uint16)(blocks_xpos - mirror_current_layer1_xpos) < 0x100)\n"
        "    SpawnSmokePuff();\n"
        "}\n",
        "void Spr0A9_Reznor_03D76C() {  // 03d76c\n"
        "  if (g_widescreen_extra || (uint16)(blocks_xpos - mirror_current_layer1_xpos) < 0x100)\n"
        "    SpawnSmokePuff();\n"
        "}\n",
    ),
])

# --- step 3, iteration 11: cluster sprites ------------------------------------
# level_cluster_sprites.asm + the $02FEC5 bounds deferred since iteration 1.
# $02FEC9's consumer was deduplicated away by the C port (no usage to patch);
# boo-buddies spread ($02F880) is SA-1-only upstream; boo ring is "functional
# as is" (its draw shares the boo routine below); the bonus-game 1up is
# 1-screen-room only.

patch_file("src/smw_02.c", [
    # $02DF83 sumo flame: spawn regardless of on-screen position (the
    # GetDrawInfo draw path, wide since iteration 4, handles culling).
    (
        "  if (cluster_spr_xpos_hi[j] ==\n"
        "        ((cluster_spr_xpos_lo[j] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    cluster_spr_spriteid[j] = 6;\n",
        "  if (g_widescreen_extra ||\n"
        "      cluster_spr_xpos_hi[j] ==\n"
        "        ((cluster_spr_xpos_lo[j] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)))\n"
        "    cluster_spr_spriteid[j] = 6;\n",
    ),
    # $02FEC5 cluster X process bounds {0x40,0xB0} -> range [-0x40, 0x140),
    # inlined by the port as a single compare; widened per direction.
    (
        "  uint16 r0w = PAIR16(cluster_spr_xpos_hi[k], cluster_spr_xpos_lo[k]);\n"
        "  if ((uint16)(r0w - mirror_current_layer1_xpos + 64) < 0x180) {\n",
        "  uint16 r0w = PAIR16(cluster_spr_xpos_hi[k], cluster_spr_xpos_lo[k]);\n"
        "  if ((uint16)(r0w - mirror_current_layer1_xpos + 64 + g_widescreen_extra) < 0x180 + 2 * g_widescreen_extra) {\n",
    ),
    # ... and its MSB-as-hide else-branch becomes 4:3-only (in widescreen the
    # draw below stores the real bit 8).
    (
        "    } else if ((uint16)(xpos - mirror_current_layer1_xpos) >> 8) {\n"
        "      sprites_oamtile_size_buffer[(kClusterSpriteOAMIndexes[k] >> 2) + 64] = 3;\n"
        "    }\n",
        "    } else if (!g_widescreen_extra && (uint16)(xpos - mirror_current_layer1_xpos) >> 8) {\n"
        "      sprites_oamtile_size_buffer[(kClusterSpriteOAMIndexes[k] >> 2) + 64] = 3;\n"
        "    }\n",
    ),
    # $02FD4D/$02FD8C boo_get_x: 9-bit OAM x for the shared boo draw (boo
    # ceiling/bat, boo ring, reappearing boo). The PPU's wrap-to-negative at
    # 256+extra reproduces the ASM's AND #$01FF culling.
    (
        "  int8 v4 = (!__CFSHL__(cluster_spr_table1e66[k], 1)) ? 0x40 : 0;\n"
        "  oam[64].flags = r2 | v4 | 0x31;\n"
        "  sprites_oamtile_size_buffer[(v2 >> 2) + 64] = 2;\n",
        "  int8 v4 = (!__CFSHL__(cluster_spr_table1e66[k], 1)) ? 0x40 : 0;\n"
        "  oam[64].flags = r2 | v4 | 0x31;\n"
        "  sprites_oamtile_size_buffer[(v2 >> 2) + 64] =\n"
        "      2 | (g_widescreen_extra\n"
        "               ? (uint8)((uint16)(PAIR16(cluster_spr_xpos_hi[k], cluster_spr_xpos_lo[k]) -\n"
        "                                  mirror_current_layer1_xpos) >> 8) & 1\n"
        "               : 0);\n",
    ),
    # $02AA71/$02AA78 castle candles: 8 candles instead of 4, covering the
    # 512px entrance-hall BG (new ones on screen 1, OAM slots 0xE0-0xEC per
    # wide-snes' DATA_02FA0A). First 4 entries stay vanilla for 4:3.
    (
        "static const uint8 kSpr0E6_LoadCandleFlames_xlo[4] = { 0x50, 0x90, 0xd0, 0x10,  };\n",
        "static const uint8 kSpr0E6_LoadCandleFlames_xlo[8] = { 0x50, 0x90, 0xd0, 0x10, 0x50, 0x90, 0xd0, 0x10,  };\n",
    ),
    (
        "static const uint8 kClusterSpr05_CandleFlame_OAMIndex[4] = { 0xf0, 0xf4, 0xf8, 0xfc,  };\n",
        "static const uint8 kClusterSpr05_CandleFlame_OAMIndex[8] = { 0xf0, 0xf4, 0xf8, 0xfc, 0xe0, 0xe4, 0xe8, 0xec,  };\n",
    ),
    (
        "  case 0xE6:\n"
        "    spr_current_status[3] = 7;\n"
        "    for (uint8 j = 3; (j & 0x80) == 0; --j) {\n"
        "      cluster_spr_spriteid[j] = 5;\n"
        "      cluster_spr_xpos_lo[j] = kSpr0E6_LoadCandleFlames_xlo[j];\n"
        "      cluster_spr_ypos_lo[j] = -16;\n"
        "      cluster_spr_table0f4a[j] = 4 * j;\n"
        "    }\n"
        "    break;\n",
        "  case 0xE6:\n"
        "    spr_current_status[3] = 7;\n"
        "    for (uint8 j = g_widescreen_extra ? 7 : 3; (j & 0x80) == 0; --j) {\n"
        "      cluster_spr_spriteid[j] = 5;\n"
        "      cluster_spr_xpos_lo[j] = kSpr0E6_LoadCandleFlames_xlo[j];\n"
        "      if (g_widescreen_extra)\n"
        "        cluster_spr_xpos_hi[j] = j >> 2;\n"
        "      cluster_spr_ypos_lo[j] = -16;\n"
        "      cluster_spr_table0f4a[j] = 4 * j;\n"
        "    }\n"
        "    break;\n",
    ),
    # $02FA2B/$02FA59/$02FA5F candles_grab_screen_x: 16-bit x against the
    # layer-2 camera + MSB; the vanilla seam-duplicate hack (hidden via
    # MSB=1, which now shows) becomes 4:3-only, matching wide-snes' RTS.
    (
        "  uint8 v1 = kClusterSpr05_CandleFlame_OAMIndex[k];\n"
        "  OamEnt *oam = get_OamEnt(oam_buf, v1);\n"
        "  oam[64].xpos = cluster_spr_xpos_lo[k] - mirror_current_layer2_xpos;\n"
        "  oam[64].ypos = cluster_spr_ypos_lo[k] - mirror_current_layer2_ypos;\n"
        "  uint8 v3 = cluster_spr_table0f4a[k] & 3;\n"
        "  oam[64].charnum = kClusterSpr05_CandleFlame_Tiles[v3];\n"
        "  oam[64].flags = kClusterSpr05_CandleFlame_Prop[v3];\n"
        "  sprites_oamtile_size_buffer[(v1 >> 2) + 64] = 2;\n"
        "  if (oam[64].xpos >= 0xF0) {\n"
        "    get_OamEnt(oam_buf, 0)[123] = oam[64];\n"
        "    sprites_oamtile_size_buffer[123] = 3;\n"
        "  }\n",
        "  uint8 v1 = kClusterSpr05_CandleFlame_OAMIndex[k];\n"
        "  OamEnt *oam = get_OamEnt(oam_buf, v1);\n"
        "  uint16 candle_sx = PAIR16(cluster_spr_xpos_hi[k], cluster_spr_xpos_lo[k]) - mirror_current_layer2_xpos;\n"
        "  oam[64].xpos = cluster_spr_xpos_lo[k] - mirror_current_layer2_xpos;\n"
        "  oam[64].ypos = cluster_spr_ypos_lo[k] - mirror_current_layer2_ypos;\n"
        "  uint8 v3 = cluster_spr_table0f4a[k] & 3;\n"
        "  oam[64].charnum = kClusterSpr05_CandleFlame_Tiles[v3];\n"
        "  oam[64].flags = kClusterSpr05_CandleFlame_Prop[v3];\n"
        "  sprites_oamtile_size_buffer[(v1 >> 2) + 64] = 2 | (g_widescreen_extra ? (candle_sx >> 8) & 1 : 0);\n"
        "  if (!g_widescreen_extra && oam[64].xpos >= 0xF0) {\n"
        "    get_OamEnt(oam_buf, 0)[123] = oam[64];\n"
        "    sprites_oamtile_size_buffer[123] = 3;\n"
        "  }\n",
    ),
])

# --- step 3, iteration 12: windowing_effects ----------------------------------
# windowing_effects.asm. wide-snes runs the whole game in the SNES 512px
# hi-res mode, so its window HDMA writes are in 2px units centered on the
# wide view (unit u covers screen x = 2u-128 .. 2u-126); every windowing
# effect's coordinates are halved at the source ("the low quality version
# but with support for any size"). Our PPU renders native-wide instead, so
# the bridge is a render flag: kPpuRenderFlags_WideWindow makes
# PpuWindows_Calc interpret the 8-bit window registers in that same 2px
# space (clamped to the visible span), and the game-side writers below are
# converted exactly like wide-snes converts them. Degenerate windows -
# empty (left > right) and full ([0, 255]) - keep their meaning under the
# transform, which is what keeps every writer wide-snes did NOT patch
# correct: the credits vertical wipe (smw_0c.c, full/empty rows only) and
# the port's own WH0=0/WH1=0xff file-select reset. The credits enemy-cast
# pillarbox wide-snes *adds* in credits.asm is deferred to the
# title/overworld/credits iteration.

patch_file("src/snes/ppu.h", [
    (
        "  // Disable sprite render limits\n"
        "  kPpuRenderFlags_NoSpriteLimits = 8,\n",
        "  // Disable sprite render limits\n"
        "  kPpuRenderFlags_NoSpriteLimits = 8,\n"
        "  // Window registers hold 2px units centered on the wide view\n"
        "  // (screen x = 2u - 128), wide-snes' 512px-mode windowing scheme.\n"
        "  kPpuRenderFlags_WideWindow = 16,\n",
    ),
])

patch_file("src/snes/ppu.c", [
    # Transform both windows' edges once, clamp into the visible span, and
    # use the locals everywhere (the equality searches below must see the
    # same values that were inserted). With the flag off every local equals
    # the vanilla expression, so 4:3 is bit-exact.
    (
        "  uint i, j;\n"
        "  int t;\n"
        "  bool w1_ena = (winflags & kWindow1Enabled) && ppu->window1left <= ppu->window1right;\n"
        "  if (w1_ena) {\n"
        "    if (ppu->window1left > win->edges[0]) {\n"
        "      win->edges[nr] = ppu->window1left;\n"
        "      win->edges[++nr] = window_right;\n"
        "    }\n"
        "    if (ppu->window1right + 1 < window_right) {\n"
        "      win->edges[nr] = ppu->window1right + 1;\n"
        "      win->edges[++nr] = window_right;\n"
        "    }\n"
        "  }\n"
        "  bool w2_ena = (winflags & kWindow2Enabled) && ppu->window2left <= ppu->window2right;\n",
        "  uint i, j;\n"
        "  int t;\n"
        "  int w1l = ppu->window1left, w1r1 = ppu->window1right + 1;\n"
        "  int w2l = ppu->window2left, w2r1 = ppu->window2right + 1;\n"
        "  if (ppu->renderFlags & kPpuRenderFlags_WideWindow) {\n"
        "    w1l = w1l * 2 - 128, w1r1 = w1r1 * 2 - 128;\n"
        "    w2l = w2l * 2 - 128, w2r1 = w2r1 * 2 - 128;\n"
        "    if (w1l < win->edges[0]) w1l = win->edges[0];\n"
        "    if (w1r1 > window_right) w1r1 = window_right;\n"
        "    if (w2l < win->edges[0]) w2l = win->edges[0];\n"
        "    if (w2r1 > window_right) w2r1 = window_right;\n"
        "  }\n"
        "  bool w1_ena = (winflags & kWindow1Enabled) && w1l < w1r1;\n"
        "  if (w1_ena) {\n"
        "    if (w1l > win->edges[0]) {\n"
        "      win->edges[nr] = w1l;\n"
        "      win->edges[++nr] = window_right;\n"
        "    }\n"
        "    if (w1r1 < window_right) {\n"
        "      win->edges[nr] = w1r1;\n"
        "      win->edges[++nr] = window_right;\n"
        "    }\n"
        "  }\n"
        "  bool w2_ena = (winflags & kWindow2Enabled) && w2l < w2r1;\n",
    ),
    (
        "    for (i = 0; i <= nr && (t = ppu->window2left) != win->edges[i]; i++) {\n",
        "    for (i = 0; i <= nr && (t = w2l) != win->edges[i]; i++) {\n",
    ),
    (
        "    for (; i <= nr && (t = ppu->window2right + 1) != win->edges[i]; i++) {\n",
        "    for (; i <= nr && (t = w2r1) != win->edges[i]; i++) {\n",
    ),
    (
        "    for (i = 0; win->edges[i] != ppu->window1left; i++);\n"
        "    for (j = i; win->edges[j] != ppu->window1right + 1; j++);\n",
        "    for (i = 0; win->edges[i] != w1l; i++);\n"
        "    for (j = i; win->edges[j] != w1r1; j++);\n",
    ),
    (
        "    for (i = 0; win->edges[i] != ppu->window2left; i++);\n"
        "    for (j = i; win->edges[j] != ppu->window2right + 1; j++);\n",
        "    for (i = 0; win->edges[i] != w2l; i++);\n"
        "    for (j = i; win->edges[j] != w2r1; j++);\n",
    ),
])

patch_file("src/main.c", [
    (
        "    g_config.no_sprite_limits * kPpuRenderFlags_NoSpriteLimits;\n",
        "    g_config.no_sprite_limits * kPpuRenderFlags_NoSpriteLimits |\n"
        "    (g_config.extended_aspect_ratio ? kPpuRenderFlags_WideWindow : 0);\n",
    ),
])

patch_file("src/smw_00.c", [
    # $00CA74 set_up_x_pos (iris circle): 16-bit center (the 8-bit read of
    # the uint16 $7E wraps when the player stands in a side extension),
    # +0x80 into wide-window space, clamped [0, 0x1FF], halved with the
    # ASM's LSR/ADC #0 rounding.
    (
        "void UpdateHDMAWindowBuffer_IrisInOnPlayerEntry(uint8 a, HdmaPtrs hptr) {  // 00ca6d\n"
        "  timer_hdmawindow_scaling_factor += a;\n"
        "  uint8 r0 = player_on_screen_pos_x + 8;\n",
        "void UpdateHDMAWindowBuffer_IrisInOnPlayerEntry(uint8 a, HdmaPtrs hptr) {  // 00ca6d\n"
        "  timer_hdmawindow_scaling_factor += a;\n"
        "  uint8 r0;\n"
        "  if (g_widescreen_extra) {\n"
        "    uint16 t = player_on_screen_pos_x + 8 + 0x80;\n"
        "    if ((t & 0x8000) != 0)\n"
        "      t = 0;\n"
        "    else if (t >= 0x1ff)\n"
        "      t = 0x1ff;\n"
        "    r0 = (t >> 1) + (t & 1);\n"
        "  } else {\n"
        "    r0 = player_on_screen_pos_x + 8;\n"
        "  }\n",
    ),
    # $00CC51 circle_window_halve: the circle/keyhole radius products are in
    # 2px window units. Covers the iris, the keyhole and the title-screen
    # circle (whose fixed 0x80 center is the same point in both spaces).
    (
        "  uint8 r2 = result;\n"
        "  return (PairU8) { .first = r2, .second = r3 };\n",
        "  uint8 r2 = result;\n"
        "  if (g_widescreen_extra) {\n"
        "    r2 >>= 1;\n"
        "    r3 >>= 1;\n"
        "  }\n"
        "  return (PairU8) { .first = r2, .second = r3 };\n",
    ),
    # $00C4DD set_up_keyhole_x_pos: same 16-bit + clamp + halve for the
    # keyhole center ($1436 - $1A + 4).
    (
        "      uint8 r0 = player_on_tilting_platform_xpos - mirror_current_layer1_xpos + 4;\n",
        "      uint8 r0;\n"
        "      if (g_widescreen_extra) {\n"
        "        uint16 t = player_on_tilting_platform_xpos - mirror_current_layer1_xpos + 4 + 0x80;\n"
        "        if ((t & 0x8000) != 0)\n"
        "          t = 0;\n"
        "        else if (t >= 0x1ff)\n"
        "          t = 0x1ff;\n"
        "        r0 = (t >> 1) + (t & 1);\n"
        "      } else {\n"
        "        r0 = player_on_tilting_platform_xpos - mirror_current_layer1_xpos + 4;\n"
        "      }\n",
    ),
    # $00C470: keyhole window size targets $90 -> $A0 (wide-snes makes the
    # halved keyhole ~11% bigger to compensate the lost pixel).
    (
        "    if (timer_hdmawindow_scaling_factor == kGameMode14_InLevel_DATA_00C470[flag_keyhole_anim_phase]) {\n",
        "    static const uint8 kWideKeyholeSize_00C470[4] = { 0xa0, 0x0, 0xa0, 0x0,  };\n"
        "    if (timer_hdmawindow_scaling_factor ==\n"
        "        (g_widescreen_extra ? kWideKeyholeSize_00C470 : kGameMode14_InLevel_DATA_00C470)[flag_keyhole_anim_phase]) {\n",
    ),
])

patch_file("src/smw_05.c", [
    # $05B25D recalc_x (layer-3 message box): half-width in 2px units, same
    # 0x80 center. The row-filling comparison keeps the unhalved timer, like
    # the ASM (it compares $1B89 itself).
    (
        "    timer_wait_before_message_window_size_change += kDisplayMessage_DATA_05B10A[flag_message_window_size_change_direction];\n"
        "    HIBYTE(v7) = timer_wait_before_message_window_size_change + 0x80;\n"
        "    LOBYTE(v7) = 0x80 - timer_wait_before_message_window_size_change;\n",
        "    timer_wait_before_message_window_size_change += kDisplayMessage_DATA_05B10A[flag_message_window_size_change_direction];\n"
        "    uint8 wt = g_widescreen_extra ? timer_wait_before_message_window_size_change >> 1\n"
        "                                  : timer_wait_before_message_window_size_change;\n"
        "    HIBYTE(v7) = wt + 0x80;\n"
        "    LOBYTE(v7) = 0x80 - wt;\n",
    ),
])

patch_file("src/smw_03.c", [
    # $03C52E/$03C533/$03C538/$03C53D spotlight lamp: edges and expansion
    # size in 2px units; the expansion covers the whole wide view
    # (0x48 * screen_size / 256 - wide-snes' "compensation" constants, with
    # !screen_size = 256 + 2*extra computed at runtime here).
    (
        "      sprc6_spotlight_left_bottom_x = 0;\n"
        "      sprc6_spotlight_right_bottom_x = -112;\n"
        "      sprc6_spotlight_left_top_x = 120;\n"
        "      sprc6_spotlight_right_top_x = -121;\n",
        "      sprc6_spotlight_left_bottom_x = 0;\n"
        "      if (g_widescreen_extra) {\n"
        "        sprc6_spotlight_right_bottom_x = 0x48 * (256 + 2 * g_widescreen_extra) >> 8;\n"
        "        sprc6_spotlight_left_top_x = 0x78 + 4 + 1;\n"
        "        sprc6_spotlight_right_top_x = 0x87 - 4;\n"
        "      } else {\n"
        "        sprc6_spotlight_right_bottom_x = -112;\n"
        "        sprc6_spotlight_left_top_x = 120;\n"
        "        sprc6_spotlight_right_top_x = -121;\n"
        "      }\n",
    ),
    # $03C491: the dir-1 expansion target scales the same way (speeds are
    # +/-1, so the equality compare still hits exactly).
    (
        "    if (sprc6_spotlight_right_bottom_x == kSpr0C6_Spotlight_DATA_03C491[sprc6_spotlight_dir])\n",
        "    uint8 wide_lamp_target = kSpr0C6_Spotlight_DATA_03C491[sprc6_spotlight_dir];\n"
        "    if (g_widescreen_extra && sprc6_spotlight_dir)\n"
        "      wide_lamp_target = 0x48 * (256 + 2 * g_widescreen_extra) >> 8;\n"
        "    if (sprc6_spotlight_right_bottom_x == wide_lamp_target)\n",
    ),
])

patch_file("src/smw_04.c", [
    # $04F453/$04F46E continue/save prompt: box half-width halved in 2px
    # units. The scanline-extent math (v2/v3 loops) keeps vanilla's rounding
    # (wide-snes' register reuse drops one +1-rounding term there; the box
    # height is intentionally unchanged either way).
    (
        "    HIBYTE(v0) = timer_wait_before_message_window_size_change + 0x80;\n",
        "    uint8 wt = g_widescreen_extra ? timer_wait_before_message_window_size_change >> 1\n"
        "                                  : timer_wait_before_message_window_size_change;\n"
        "    HIBYTE(v0) = wt + 0x80;\n",
    ),
    (
        "    LOBYTE(v0) = 0x80 - timer_wait_before_message_window_size_change;\n",
        "    LOBYTE(v0) = 0x80 - wt;\n",
    ),
    # $04DB08/$04DB0C overworld shrink/expand transition: horizontal speed
    # and max size halved and rescaled 28 -> 32 blocks like wide-snes
    # (256px effective area; the vertical tables stay vanilla).
    (
        "  int v0 = ow_hdmatransition_effect_flag >> 1;\n"
        "  ow_hdmatransition_effect_xpos += kInitializeWindowHDMA_DATA_04DB08[v0];\n"
        "  if (((kInitializeWindowHDMA_DATA_04DB08[v0] ^\n"
        "        (ow_hdmatransition_effect_xpos -\n"
        "         *(uint16 *)&kInitializeWindowHDMA_DATA_04DB0C[ow_hdmatransition_effect_flag])) &\n"
        "       0x8000) == 0 ||\n"
        "      (ow_hdmatransition_effect_ypos += kInitializeWindowHDMA_DATA_04DB10[v0],\n"
        "       ((kInitializeWindowHDMA_DATA_04DB10[v0] ^\n"
        "         (ow_hdmatransition_effect_ypos -\n"
        "          *(uint16 *)&kInitializeWindowHDMA_DATA_04DB14[ow_hdmatransition_effect_flag])) &\n"
        "        0x8000) == 0)) {\n"
        "    ow_hdmatransition_effect_xpos = *(uint16 *)&kInitializeWindowHDMA_DATA_04DB0C[ow_hdmatransition_effect_flag];\n",
        "  static const uint16 kWideWindowHDMA_Speed_04DB08[2] = { 0xfc00, 0x400,  };\n"
        "  static const uint8 kWideWindowHDMA_MinMax_04DB0C[4] = { 0x0, 0x0, 0x0, 0x40,  };\n"
        "  const uint16 *spd = g_widescreen_extra ? kWideWindowHDMA_Speed_04DB08 : kInitializeWindowHDMA_DATA_04DB08;\n"
        "  const uint8 *mm = g_widescreen_extra ? kWideWindowHDMA_MinMax_04DB0C : kInitializeWindowHDMA_DATA_04DB0C;\n"
        "  int v0 = ow_hdmatransition_effect_flag >> 1;\n"
        "  ow_hdmatransition_effect_xpos += spd[v0];\n"
        "  if (((spd[v0] ^\n"
        "        (ow_hdmatransition_effect_xpos -\n"
        "         *(uint16 *)&mm[ow_hdmatransition_effect_flag])) &\n"
        "       0x8000) == 0 ||\n"
        "      (ow_hdmatransition_effect_ypos += kInitializeWindowHDMA_DATA_04DB10[v0],\n"
        "       ((kInitializeWindowHDMA_DATA_04DB10[v0] ^\n"
        "         (ow_hdmatransition_effect_ypos -\n"
        "          *(uint16 *)&kInitializeWindowHDMA_DATA_04DB14[ow_hdmatransition_effect_flag])) &\n"
        "        0x8000) == 0)) {\n"
        "    ow_hdmatransition_effect_xpos = *(uint16 *)&mm[ow_hdmatransition_effect_flag];\n",
    ),
    # $049630: the shrink animation's initial size, same halved-and-rescaled
    # value as the expand maximum.
    (
        "    ow_hdmatransition_effect_xpos = 0x7000;\n",
        "    ow_hdmatransition_effect_xpos = g_widescreen_extra ? 0x4000 : 0x7000;\n",
    ),
])

# --- step 3, iteration 13: shooters + generators -------------------------------
# level_shooters.asm + level_generators.asm. The C port already computes
# generator spawn positions in 16 bits (PAIR16 hi/lo tables), so wide-snes'
# generator_high_table JSL ($02B135) and its hi-byte fixups ($02B073) are
# covered by plain signed arithmetic here. Skipped like upstream: fish
# generator ("range is already tight") and parachute enemies ("ignored").

patch_file("src/smw_02.c", [
    # $02B3CC torpedo ted: the on-screen-x + 8-bit range check becomes one
    # 16-bit range check [0x10-extra, 0xF1+extra) against the camera (the
    # Y check stays vanilla, like the ASM). 4:3 keeps the vanilla pair.
    (
        "        shooter_spr_xpos_hi[k] ==\n"
        "            (uint8)((shooter_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n"
        "        (uint8)(shooter_spr_xpos_lo[k] - mirror_current_layer1_xpos + 16) >= 0x20) {\n",
        "        (g_widescreen_extra\n"
        "             ? (int16)(PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) - mirror_current_layer1_xpos) >=\n"
        "                       0x10 - (int16)g_widescreen_extra &&\n"
        "               (int16)(PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) - mirror_current_layer1_xpos) <\n"
        "                       0xF1 + (int16)g_widescreen_extra\n"
        "             : shooter_spr_xpos_hi[k] ==\n"
        "                   (uint8)((shooter_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n"
        "               (uint8)(shooter_spr_xpos_lo[k] - mirror_current_layer1_xpos + 16) >= 0x20)) {\n",
    ),
    # $02B47C bullet bill shooter: same 16-bit range, plus the don't-fire-
    # point-blank player-distance check recomputed in 16 bits (the vanilla
    # 8-bit distance aliases every 256px in widescreen).
    (
        "        shooter_spr_xpos_hi[k] ==\n"
        "            (uint8)((shooter_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n"
        "        (uint8)(shooter_spr_xpos_lo[k] - mirror_current_layer1_xpos + 0x10) >= 0x10 &&\n"
        "        (uint8)(player_xpos - shooter_spr_xpos_lo[k] + 0x11) >= 0x22) {\n",
        "        (g_widescreen_extra\n"
        "             ? (int16)(PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) - mirror_current_layer1_xpos) >=\n"
        "                       0x10 - (int16)g_widescreen_extra &&\n"
        "               (int16)(PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) - mirror_current_layer1_xpos) <\n"
        "                       0xF1 + (int16)g_widescreen_extra &&\n"
        "               (uint16)(player_xpos - PAIR16(shooter_spr_xpos_hi[k], shooter_spr_xpos_lo[k]) + 0x10) >= 0x21\n"
        "             : shooter_spr_xpos_hi[k] ==\n"
        "                   (uint8)((shooter_spr_xpos_lo[k] < (uint8)mirror_current_layer1_xpos) + HIBYTE(mirror_current_layer1_xpos)) &&\n"
        "               (uint8)(shooter_spr_xpos_lo[k] - mirror_current_layer1_xpos + 0x10) >= 0x10 &&\n"
        "               (uint8)(player_xpos - shooter_spr_xpos_lo[k] + 0x11) >= 0x22)) {\n",
    ),
    # $02B06D/$02B073 Bowser-statue fire: spawns at the wide right edge.
    (
        "      SetSprXPos(j, mirror_current_layer1_xpos + 255);\n",
        "      SetSprXPos(j, mirror_current_layer1_xpos + 255 + g_widescreen_extra);\n",
    ),
    # $02B1B8 shared super-koopa/bubble/bullet spawn offsets {-0x20, +0x110}
    # pushed extra further out (three call sites read the same table; the
    # +/-0 case self-gates in 4:3).
    (
        "      SetSprYPos(j, (mirror_current_layer1_ypos + (r & 0x7F) + 32) & ~0xf);\n"
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]));\n",
        "      SetSprYPos(j, (mirror_current_layer1_ypos + (r & 0x7F) + 32) & ~0xf);\n"
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]) +\n"
        "                        ((r & 1) ? (int)g_widescreen_extra : -(int)g_widescreen_extra));\n",
    ),
    (
        "      spr_yspeed[j] = 40;\n"
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]));\n",
        "      spr_yspeed[j] = 40;\n"
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]) +\n"
        "                        ((r & 1) ? (int)g_widescreen_extra : -(int)g_widescreen_extra));\n",
    ),
    (
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]));\n"
        "      spr_table157c[j] = r & 1;\n"
        "      spr_table00c2[j] = kGenSpr0A_GenerateBubbles_DATA_02B25A[GetRand() & 3];\n",
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr09_GenerateSuperKoopa_InitialXHi[r & 1], kGenSpr09_GenerateSuperKoopa_InitialXLo[r & 1]) +\n"
        "                        ((r & 1) ? (int)g_widescreen_extra : -(int)g_widescreen_extra));\n"
        "      spr_table157c[j] = r & 1;\n"
        "      spr_table00c2[j] = kGenSpr0A_GenerateBubbles_DATA_02B25A[GetRand() & 3];\n",
    ),
    # $02B25E dolphins {+0x110, -0x20}: note the flipped index order.
    (
        "    SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSprXX_GenerateDolphins_InitialXHi[v5 - 5], kGenSprXX_GenerateDolphins_InitialXLo[v5 - 5]));\n",
        "    SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSprXX_GenerateDolphins_InitialXHi[v5 - 5], kGenSprXX_GenerateDolphins_InitialXLo[v5 - 5]) +\n"
        "                      ((v5 - 5) ? -(int)g_widescreen_extra : (int)g_widescreen_extra));\n",
    ),
    # $02B2D0 eerie {-0x10, +0xFF}. Deviation, documented: upstream's
    # "db $FF+!extra_columns" truncates mod 256 (their right-side spawn
    # lands inside the view); the 16-bit add here does what the patch means.
    (
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr01_GenerateEerie_InitialXHi[v6], kGenSpr01_GenerateEerie_InitialXLo[v6]));\n",
        "      SetSprXPos(j, mirror_current_layer1_xpos + PAIR16(kGenSpr01_GenerateEerie_InitialXHi[v6], kGenSpr01_GenerateEerie_InitialXLo[v6]) +\n"
        "                        (v6 ? (int)g_widescreen_extra : -(int)g_widescreen_extra));\n",
    ),
    # $02B0FA/$02B135 surrounded/diagonal bullet star: edge spawn offsets
    # widened (surrounded keeps upstream's extra +/-0x10 "personal
    # improvement" margin); the hi-table JSL is subsumed by 16-bit math.
    (
        "    SetSprXPos(j, mirror_current_layer1_xpos + kGenSpr0C_GenerateSurroundingBullets_InitialXLo[r13]);\n",
        "    static const int8 kWideBulletSign[9] = { -1, -1, 0, 0, 1, -1, -1, 1, 1 };\n"
        "    static const uint8 kWideBulletPad[9] = { 0x10, 0x10, 0, 0, 0x10, 0, 0, 0, 0 };\n"
        "    SetSprXPos(j, mirror_current_layer1_xpos + kGenSpr0C_GenerateSurroundingBullets_InitialXLo[r13] +\n"
        "                      (g_widescreen_extra ? kWideBulletSign[r13] * (int)(g_widescreen_extra + kWideBulletPad[r13]) : 0));\n",
    ),
])

# --- step 3, iteration 14: misc fixes (feather freeze, spinning coins, yoshi) --
# feather_fix.asm + level_sprite_spinning.asm + level_yoshi.asm.
# Skipped, with reasons: goal_fix.asm and feather_score_fix.asm are vanilla
# QoL bugfixes wide-snes bundles (no widescreen interaction; porting them
# would break the 4:3-bit-exact policy); luigi.asm is a content addition
# needing binary GFX we don't ship; facing_fix.asm exists to support the
# screen-1 entrance placement and goes with the deferred entrances package.

patch_file("src/smw_01.c", [
    # $01C5AE feather freeze (Romi's fix, bundled by wide-snes): vanilla
    # only runs the cape-transform state change when both on-screen hi
    # bytes are 0 — but the caller locks sprites unconditionally, so
    # catching a feather while "offscreen" hangs the game. In widescreen
    # the side extensions make HIBYTE(x) = 0xFF legitimately reachable, so
    # the hang would be a normal gameplay event. 4:3 keeps the vanilla
    # check (and its obscure autoscroll freeze) bit-exact.
    (
        "  if (!(HIBYTE(player_on_screen_pos_x) | HIBYTE(player_on_screen_pos_y))) {\n",
        "  if (g_widescreen_extra || !(HIBYTE(player_on_screen_pos_x) | HIBYTE(player_on_screen_pos_y))) {\n",
    ),
    # $01F418 yoshi tongue: 16-bit base x (yoshi x + sign-extended tip
    # displacement - camera), and no tip-offscreen abort in widescreen.
    (
        "  r13 = kSpr035_Yoshi_DATA_01F60A[v1];\n"
        "  int t = (uint8)(spr_xpos_lo[k] - mirror_current_layer1_xpos) + r13;\n"
        "  uint8 r0 = t;\n"
        "  if (spr_table157c[k] ? !(t & 0x100) : (t & 0x100))\n"
        "    return r13;\n",
        "  r13 = kSpr035_Yoshi_DATA_01F60A[v1];\n"
        "  int t = (uint8)(spr_xpos_lo[k] - mirror_current_layer1_xpos) + r13;\n"
        "  uint8 r0 = t;\n"
        "  int16 wsx = 0;\n"
        "  if (g_widescreen_extra)\n"
        "    wsx = (int16)(GetSprXPos(k) - mirror_current_layer1_xpos) + (int8)r13;\n"
        "  else if (spr_table157c[k] ? !(t & 0x100) : (t & 0x100))\n"
        "    return r13;\n",
    ),
    # $01F464/$01F474 per-tile: 9-bit x via the OAM MSB instead of the
    # vanilla stop-at-the-edge break (wide-snes' rewrite has no break; its
    # own comment flags the >512px wrap as a known ultrawide corner).
    (
        "    OamEnt *oam = get_OamEnt(oam_buf, v3);\n"
        "    oam->xpos = r0;\n"
        "    uint16 t = r5 + r0;\n"
        "    r0 = t;\n"
        "    if (sign8(r5) ? (t & 0x100) == 0 : (t & 0x100) != 0)\n"
        "      break;\n",
        "    OamEnt *oam = get_OamEnt(oam_buf, v3);\n"
        "    oam->xpos = r0;\n"
        "    uint16 t = r5 + r0;\n"
        "    r0 = t;\n"
        "    uint8 wmsb = 0;\n"
        "    if (g_widescreen_extra) {\n"
        "      wmsb = (wsx >> 8) & 1;\n"
        "      wsx += (int8)r5;\n"
        "    } else if (sign8(r5) ? (t & 0x100) == 0 : (t & 0x100) != 0)\n"
        "      break;\n",
    ),
    (
        "    sprites_oamtile_size_buffer[v3 >> 2] = 0;\n",
        "    sprites_oamtile_size_buffer[v3 >> 2] = wmsb;\n",
    ),
    # $01F065/$01F079/$01F09B yoshi throat (the swallow animation tile):
    # MSB = bit 8 of the 16-bit screen x + signed displacement (the lo-byte
    # xpos write is the same value in both modes and stays vanilla).
    (
        "      sprites_oamtile_size_buffer[64] = 0;\n",
        "      sprites_oamtile_size_buffer[64] =\n"
        "          g_widescreen_extra\n"
        "              ? (uint8)(((int16)(GetSprXPos(k) - mirror_current_layer1_xpos) +\n"
        "                         (int8)kSpr035_Yoshi_YoshiThroatXDisp[r2]) >> 8) & 1\n"
        "              : 0;\n",
    ),
])

patch_file("src/smw_02.c", [
    # $029A18 spinning coins: 16-bit screen x with wide despawn bounds
    # [-extra, 0x100+extra) (vanilla culls at 8 bits with no hi check, so
    # coins wrap into view every 256px). The layer-index camera trick
    # (v2 = 4*layer) picks layer 1 or 2 exactly like the ASM's $001B,y.
    (
        "  if ((uint8)(block_coin_spr_xpos_lo[k] - r3) >= 0xF8) {\n"
        "LABEL_9:\n"
        "    block_coin_spr_slotid[k] = 0;\n"
        "    return;\n"
        "  }\n",
        "  int16 wsx = 0;\n"
        "  if (g_widescreen_extra)\n"
        "    wsx = (int16)(PAIR16(block_coin_spr_xpos_hi[k], block_coin_spr_xpos_lo[k]) -\n"
        "                  PAIR16(*((uint8 *)&mirror_current_layer1_xpos + v2 + 1), r3));\n"
        "  if (g_widescreen_extra ? (wsx < -(int16)g_widescreen_extra || wsx >= 0x100 + (int16)g_widescreen_extra)\n"
        "                         : (uint8)(block_coin_spr_xpos_lo[k] - r3) >= 0xF8) {\n"
        "LABEL_9:\n"
        "    block_coin_spr_slotid[k] = 0;\n"
        "    return;\n"
        "  }\n",
    ),
    # $029A5C: the coin tile's OAM MSB.
    (
        "  oam->charnum = -24;\n"
        "  oam->flags = sprites_tile_priority | 4;\n"
        "  sprites_oamtile_size_buffer[v3 >> 2] = 2;\n",
        "  oam->charnum = -24;\n"
        "  oam->flags = sprites_tile_priority | 4;\n"
        "  sprites_oamtile_size_buffer[v3 >> 2] = 2 | (g_widescreen_extra ? (wsx >> 8) & 1 : 0);\n",
    ),
    # $029A7A/$029A9E: the two rolling-animation tiles sit at x+4; their
    # MSB carries the +4 overflow like the ASM's ADC #$00.
    (
        "    v5 >>= 2;\n"
        "    sprites_oamtile_size_buffer[v5] = 0;\n"
        "    sprites_oamtile_size_buffer[v5 + 1] = 0;\n",
        "    v5 >>= 2;\n"
        "    uint8 wmsb = g_widescreen_extra ? (uint8)((wsx + 4) >> 8) & 1 : 0;\n"
        "    sprites_oamtile_size_buffer[v5] = wmsb;\n"
        "    sprites_oamtile_size_buffer[v5 + 1] = wmsb;\n",
    ),
])

# --- step 3, iteration 15: proximity_wrap_fix -----------------------------------
# proximity_wrap_fix.asm (GreenHammerBro/JackTheSpades/RussianMan, bundled
# by wide-snes). Vanilla proximity checks truncate the player-sprite
# distance to 8 bits, so they wrap every 256px: a thwomp (etc.) a screen
# away reacts as if adjacent — invisible in 4:3, but in widescreen the
# misbehaving sprite can be *visible* in a side extension. The C port's
# direction helpers already compute full-width differences; the wrap lives
# in each caller's (uint8) cast, so the port is a gated cast-widening
# helper applied at the 15 band checks below. 4:3 keeps the vanilla wrap
# (and its bugs) bit-exact. Skipped: the swooper facing flip (upstream's
# "doesn't face player correctly" EOR) — a vanilla facing quirk with no
# widescreen interaction.

patch_file("src/smw_rtl.h", [
    (
        "static inline uint16 WideExtendBound(uint16 v) {\n"
        "  return v >= 0x8000 ? v - g_widescreen_extra : v + g_widescreen_extra;\n"
        "}\n",
        "static inline uint16 WideExtendBound(uint16 v) {\n"
        "  return v >= 0x8000 ? v - g_widescreen_extra : v + g_widescreen_extra;\n"
        "}\n"
        "// proximity_wrap_fix: vanilla band checks truncate the player-sprite\n"
        "// distance to 8 bits (wraps every 256px); widescreen compares 16-bit.\n"
        "static inline uint16 WideProximity(uint16 d) {\n"
        "  return g_widescreen_extra ? d : (uint8)d;\n"
        "}\n",
    ),
])

patch_file("src/smw_01.c", [
    # $01AED7/$01AEE5 thwomp face + fall ranges.
    (
        "    if ((uint8)(xx + 64) < 0x80)\n",
        "    if (WideProximity(xx + 64) < 0x80)\n",
    ),
    (
        "    if ((uint8)(xx + 36) < 0x50) {\n",
        "    if (WideProximity(xx + 36) < 0x50) {\n",
    ),
    # $01F76E yoshi egg hatch range.
    (
        "      if ((uint8)(player_current_xpos - GetSprXPos(k) + 32) < 0x40) {\n",
        "      if (WideProximity(player_current_xpos - GetSprXPos(k) + 32) < 0x40) {\n",
    ),
    # $01E2E0 ledge/ground dwelling moles.
    (
        "  if ((uint8)(player_current_xpos - GetSprXPos(k) + 96) < 0xC0 && !spr_xoffscreen_flag[k]) {\n",
        "  if (WideProximity(player_current_xpos - GetSprXPos(k) + 96) < 0xC0 && !spr_xoffscreen_flag[k]) {\n",
    ),
    # $018ED0 classic/upside-down piranha plant.
    (
        "(uint8)(player_current_xpos - GetSprXPos(k) + 0x1b) >= 0x37)) {\n",
        "WideProximity(player_current_xpos - GetSprXPos(k) + 0x1b) >= 0x37)) {\n",
    ),
])

patch_file("src/smw_02.c", [
    # $02C360 whistlin' chuck.
    (
        "    if ((uint8)(player_xpos - GetSprXPos(k) + 48) < 0x60)\n",
        "    if (WideProximity(player_xpos - GetSprXPos(k) + 48) < 0x60)\n",
    ),
    # $02C602 splittin'/bouncin' chuck.
    (
        "  if ((uint8)(player_xpos - GetSprXPos(k) + 80) >= 0xA0) {\n",
        "  if (WideProximity(player_xpos - GetSprXPos(k) + 80) >= 0xA0) {\n",
    ),
    # $02C64A/$02C6BA chargin' chuck vertical ranges.
    (
        "    if ((uint8)(player_ypos - GetSprYPos(k) + 40) < 0x50) {\n",
        "    if (WideProximity(player_ypos - GetSprYPos(k) + 40) < 0x50) {\n",
    ),
    (
        "  if ((uint8)(player_ypos - GetSprYPos(k) + 48) < 0x60 && CheckPlayerPositionRelativeToSprite_Bank23_X(k) == spr_table157c[k]) {\n",
        "  if (WideProximity(player_ypos - GetSprYPos(k) + 48) < 0x60 && CheckPlayerPositionRelativeToSprite_Bank23_X(k) == spr_table157c[k]) {\n",
    ),
    # $02C05C/$02C067 rip van fish wake ranges.
    (
        "          if ((uint8)(player_xpos - GetSprXPos(k) + 48) >= 0x60)\n",
        "          if (WideProximity(player_xpos - GetSprXPos(k) + 48) >= 0x60)\n",
    ),
    (
        "          if ((uint8)(player_ypos - GetSprYPos(k) + 48) >= 0x60)\n",
        "          if (WideProximity(player_ypos - GetSprYPos(k) + 48) >= 0x60)\n",
    ),
    # $02E143 jumping piranha plant (and fire variant).
    (
        "        if ((uint8)(player_xpos - GetSprXPos(k) + 27) >= 0x37) {\n",
        "        if (WideProximity(player_xpos - GetSprXPos(k) + 27) >= 0x37) {\n",
    ),
    # $02E44D exploding block.
    (
        "    if ((uint8)(player_xpos - GetSprXPos(k) + 96) < 0xC0 && !spr_xoffscreen_flag[k])\n",
        "    if (WideProximity(player_xpos - GetSprXPos(k) + 96) < 0xC0 && !spr_xoffscreen_flag[k])\n",
    ),
])

patch_file("src/smw_03.c", [
    # $0388E9 swooper bat wake range.
    (
        "    if ((uint8)(player_xpos - GetSprXPos(k) + 80) < 0xA0) {\n",
        "    if (WideProximity(player_xpos - GetSprXPos(k) + 80) < 0xA0) {\n",
    ),
    # $03924E falling spike (the C port's vanilla uses $94 next-frame x
    # where upstream's rewrite picked $D1; we keep the C's vanilla source
    # and only widen the truncation).
    (
        "  if ((uint8)(player_xpos - GetSprXPos(k) + 64) < 0x80) {\n",
        "  if (WideProximity(player_xpos - GetSprXPos(k) + 64) < 0x80) {\n",
    ),
])

# --- step 3, iteration 16: bosses (room-independent hooks) ----------------------
# level_bosses.asm, the parts that don't depend on wide-snes' LM-edited
# rooms. Ported: Ludwig/Morton/Roy act trigger ($01CE36), Bowser safe
# distance ($03AB94), bowling-ball outside-fall ($03B193). Deferred to the
# rooms/base-BPS package: Iggy/Larry lava-stream extension ($03C0CD — its
# 12 extra tiles overwrite the first 12 of the 20 reserved OAM slots and
# only compose sanely against their arena layout), Lemmy/Wendy 8th pipe
# ($03CC38.. — spawn points must match the room's pipe graphics), Bowser
# C1 interaction fill ($009A17 — arena map16 mutation, unverifiable until
# a script reaches the fight). SA-1-only blocks (maxtile arena, Ludwig
# room) don't apply; iggy_hair.asm is a vanilla cosmetic fix (skip, same
# policy as goal_fix).

patch_file("src/smw_01.c", [
    # $01CE36: the koopa-kid intro (pillars) triggers when the camera
    # reaches the equivalent view position. Note: at extra >= 0x37 the
    # camera-inset minimum already exceeds the threshold, so in 16:9 the
    # fight starts on entry - correct, since the arena is fully in view.
    (
        "  } else if ((uint8)mirror_current_layer1_xpos >= 0x7E) {\n",
        "  } else if ((uint8)mirror_current_layer1_xpos >= (uint8)(0x7E - g_widescreen_extra)) {\n",
    ),
])

patch_file("src/smw_03.c", [
    # $03AB94 Bowser safe distance: while hopping (phase 3), steer back
    # toward the vanilla 256px band instead of chasing the player into an
    # extension (screen-x + 15 outside [0x30, 0xD0) forces the direction).
    (
        "    spr_xspeed[k] = kSpr0A0_ActivateBowserBattle_DATA_03AB62[CheckPlayerPositionRelativeToSprite_Bank23_X(k)];\n",
        "    uint8 bdir = CheckPlayerPositionRelativeToSprite_Bank23_X(k);\n"
        "    if (g_widescreen_extra) {\n"
        "      int16 bsx = (int16)(GetSprXPos(k) + 15 - mirror_current_layer1_xpos);\n"
        "      if (bsx < 0x30)\n"
        "        bdir = 0;\n"
        "      else if (bsx >= 0xD0)\n"
        "        bdir = 1;\n"
        "    }\n"
        "    spr_xspeed[k] = kSpr0A0_ActivateBowserBattle_DATA_03AB62[bdir];\n",
    ),
    # $03B193 bowling ball: outside the vanilla window [-12, 0xFC) the
    # floor bounce is suppressed, so balls rolling into an extension fall
    # away instead of bouncing along forever.
    (
        "    if ((spr_yspeed[k] & 0x80) == 0 && (spr_ypos_hi[k] & 0x80) == 0 && spr_ypos_lo[k] >= 0xB0) {\n",
        "    if ((spr_yspeed[k] & 0x80) == 0 && (spr_ypos_hi[k] & 0x80) == 0 && spr_ypos_lo[k] >= 0xB0 &&\n"
        "        (!g_widescreen_extra ||\n"
        "         ((int16)(GetSprXPos(k) - mirror_current_layer1_xpos) >= -12 &&\n"
        "          (int16)(GetSprXPos(k) - mirror_current_layer1_xpos) < 0xFC))) {\n",
    ),
])

# --- step 3, iteration 17: dry bones (deferred since iteration 5) ---------------
# level_sprites.asm $01E465/$01E46C/$01E4AE. The crumbled-pile draw (shared
# dry bones / bony beetle path in Spr031_BonyBeetle, 01e42b) draws tile 1
# via GenericGFXRtDraw1Tile16x16 (wide MSB correct at that instant), then
# retiles it, builds tile 2 manually, nudges BOTH tiles' 8-bit xpos for
# the reassembly shake, and only runs FinishOAMWrite over tile 2 (plus the
# same phantom third tile vanilla always touched). The shake nudge can
# roll tile 1's xpos over 0xFF with a stale MSB. wide-snes' fix is "make
# finish OAM redo the calculations"; the C equivalent is to start
# FinishOAMWrite at the original index with one extra tile, so tile 1 is
# re-derived after every modification. The phantom tile gets the identical
# treatment vanilla gave it, and 4:3 keeps the vanilla call.

patch_file("src/smw_01.c", [
    (
        "  uint8 v5 = spr_decrementing_table1540[k];\n"
        "  if (v5 && v5 < 0x40) {\n"
        "    oam[64].xpos += (v5 & 2) != 0;\n"
        "    oam[65].xpos += (v5 & 2) != 0;\n"
        "  }\n"
        "  FinishOAMWrite(k, 2, 1);\n",
        "  uint8 v5 = spr_decrementing_table1540[k];\n"
        "  if (v5 && v5 < 0x40) {\n"
        "    oam[64].xpos += (v5 & 2) != 0;\n"
        "    oam[65].xpos += (v5 & 2) != 0;\n"
        "  }\n"
        "  if (g_widescreen_extra) {\n"
        "    spr_oamindex[k] = v3;\n"
        "    FinishOAMWrite(k, 2, 2);\n"
        "    spr_oamindex[k] = v3 + 4;\n"
        "  } else {\n"
        "    FinishOAMWrite(k, 2, 1);\n"
        "  }\n",
    ),
])

# --- step 3, iteration 18: player walk-to-edge + pillarbox non-level modes -----
# main.asm $00E9B5/$00E9C2: the player screen-bounds routine (00e98c) blocks
# Mario at [camera+8, camera+0xE8]; iteration 2 widened only the $00E9A1
# kill-range in the same routine, so with the camera inset Mario hit an
# invisible wall ~extra px before the visible edge whenever scrolling ends.
# wide-snes widens both immediates: right 0xE8+extra, left 8-extra, restoring
# the vanilla 24px/8px margins to the *visible* edges. The ASM computes each
# bound once; the decompiler duplicated the right-bound expression into the
# if and the else argument, so one anchor covers the whole if/else.

patch_file("src/smw_00.c", [
    (
        "    if ((int16)(misc_layer1_pos[0].x + 232 - player_xpos) > 0)\n"
        "      HandlePlayerLevelColl_00E9C8(1, (int16)(player_xpos - 8 - misc_layer1_pos[0].x) < 0);\n"
        "    else\n"
        "      HandlePlayerLevelColl_00E9C8(0, (int16)(misc_layer1_pos[0].x + 232 - player_xpos) < 0);\n",
        "    if ((int16)(misc_layer1_pos[0].x + 232 + g_widescreen_extra - player_xpos) > 0)\n"
        "      HandlePlayerLevelColl_00E9C8(1, (int16)(player_xpos + g_widescreen_extra - 8 - misc_layer1_pos[0].x) < 0);\n"
        "    else\n"
        "      HandlePlayerLevelColl_00E9C8(0, (int16)(misc_layer1_pos[0].x + 232 + g_widescreen_extra - player_xpos) < 0);\n",
    ),
])

# Pillarbox (the backlog's "pillarbox decision"): title/overworld/credits keep
# vanilla 4:3 composition between black side bars; only the level band of game
# modes renders wide. Two parts, both zelda3-style:
#
# ppu.c: smw's LakeSnes copy predates zelda3's per-frame side-space support --
# PpuDrawWholeLine offsets the row by (extraLeftRight - extraLeftCur) and the
# window edges honor extraLeftCur/extraRightCur, but nothing clears the row
# margins outside the rendered extent (invisible until now because we always
# rendered the full extent). Port the trailing margin memsets from zelda3's
# PpuDrawWholeLine. Forced-blank lines already clear the full wide row.

patch_file("src/snes/ppu.c", [
    (
        "  } while (cw_clip_math >>= 1, ++windex < cwin.nr);\n",
        "  } while (cw_clip_math >>= 1, ++windex < cwin.nr);\n"
        "\n"
        "  if (ppu->extraLeftRight - ppu->extraLeftCur != 0)\n"
        "    memset(dst_org, 0, sizeof(uint32) * (ppu->extraLeftRight - ppu->extraLeftCur));\n"
        "  if (ppu->extraLeftRight - ppu->extraRightCur != 0)\n"
        "    memset(dst_org + (256 + ppu->extraLeftRight * 2 - (ppu->extraLeftRight - ppu->extraRightCur)), 0,\n"
        "           sizeof(uint32) * (ppu->extraLeftRight - ppu->extraRightCur));\n",
    ),
])

# smw_rtl.c: clamp the drawing PPU's current side space each frame from the
# game mode. main.c's step-9a refresh keeps writing extraLeftRight/Cur before
# draw_ppu_frame(), so this runs last. The wide band 0x10-0x18 = level load
# (0x10-0x13, black/message screens), in-level (0x14), level fade-out + death
# message (0x15-0x18); every transition in or out of the band passes through
# black (fade/mosaic), so the bars open and close invisibly. In 4:3
# extraLeftRight is 0 and this is a no-op.

patch_file("src/smw_rtl.c", [
    (
        "void SmwDrawPpuFrame(void) {\n"
        "  SimpleHdma hdma_chans[3];\n",
        "void SmwDrawPpuFrame(void) {\n"
        "  SimpleHdma hdma_chans[3];\n"
        "\n"
        "  g_ppu->extraLeftCur = g_ppu->extraRightCur =\n"
        "      (misc_game_mode >= 0x10 && misc_game_mode <= 0x18) ? g_ppu->extraLeftRight : 0;\n",
    ),
])

print("patch-smw-widescreen: ppu.h, ppu.c, config.c, main.c, smw_rtl.h, funcs.h, variables.h, smw_rtl.c, smw_00/01/02/03/04/05.c patched OK")
