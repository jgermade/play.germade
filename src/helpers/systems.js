// The emulated systems, as the launcher shows them: name, the extensions the drawer's
// picker offers, the Neo Geo BIOS's name, and the on-screen pad a version wants.
// Identifying ROMs is rom-manager's (its DATs, through /roms/roms-sdk.js): nothing here
// reads a ROM.

export const SYSTEMS = {
  megadrive: { id: 'megadrive', title: 'Mega Drive', extensions: ['.bin', '.gen', '.md', '.smd'] },
  snes: { id: 'snes', title: 'Super Nintendo', extensions: ['.sfc', '.smc', '.fig', '.swc'] },
  gba: { id: 'gba', title: 'Game Boy Advance', extensions: ['.gba', '.agb', '.gb', '.gbc', '.sgb', '.cgb'] },
  // Arcade-style sets: the zip is the game, and FBNeo finds it by its driver name.
  neogeo: { id: 'neogeo', title: 'Neo Geo', extensions: ['.zip', '.neo'], biosDriver: 'neogeo' },
};

/** The on-screen pad for a version: Game Boy and Color carts in the GBA library get theirs. */
export const touchSystemFor = (system, version) => (system === 'gba' ? version?.platform ?? 'gba' : system);

/**
 * The usual box of each rom-manager system, width / height: the median of libretro-thumbnails'
 * boxarts, measured 2026-11-17 (12 random boxes each). It shapes a tile until its own cover
 * has loaded; then the cover's own proportions win, since they vary by region and release
 * (a Super Famicom box is portrait, 0.55; a US / EU Super Nintendo box is landscape, ~1.4).
 */
export const BOX_RATIO = { GAMEBOY: 1, GBC: 0.97, GBA: 1.12, MegaDrive: 0.7, SNES: 1.4, NEOGEO: 0.7 };

/** A tile with the area of a 78px square, in the given proportions (width / height). */
export function boxShape(ratio) {
  const r = Math.min(2, Math.max(0.45, Number(ratio) || 1));
  return { w: Math.round(Math.sqrt(78 * 78 * r)), h: Math.round(Math.sqrt((78 * 78) / r)) };
}
