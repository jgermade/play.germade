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
