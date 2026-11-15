// Game Boy Advance, Game Boy and Game Boy Color ROM identification — pure functions, no I/O.
//
// One library for the three handhelds (mGBA plays all of them). ROM Manager's DATs come
// first (by checksum, src/services/dat.service.js); the cartridge header is the fallback
// for what the catalogue does not know (homebrew, hacks):
//
//   GBA  0xA0 title (12) · 0xAC game code (4) · 0xB0 maker (2) · 0xB2 fixed 0x96
//        0xBC version · 0xBD complement: -(sum of 0xA0..0xBC) - 0x19
//   GB   0x134 title (16; 11 on later carts, 15 when 0x143 is the CGB flag)
//        0x143 CGB flag (0x80 also on Game Boy, 0xC0 Color only)
//        0x14C version · 0x14D checksum: x = x - byte - 1 over 0x134..0x14C

import { displayTitle, slug, stripVersion } from './mega-drive.js';

export const SYSTEM = {
  id: 'gba',
  title: 'Game Boy Advance',
  extensions: ['.gba', '.agb', '.gb', '.gbc', '.sgb', '.cgb'],
};

const ascii = (bytes, start, length) => {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0) break;
    out += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
};

/** A GBA header whose fixed byte and complement check out. */
export function gbaHeader(rom) {
  if (rom.length < 0xc0 || rom[0xb2] !== 0x96) return null;
  let sum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) sum = (sum + rom[i]) & 0xff;
  const complement = (-(sum + 0x19)) & 0xff;
  return complement === rom[0xbd]
    ? { title: ascii(rom, 0xa0, 12), code: ascii(rom, 0xac, 4), version: rom[0xbc] }
    : null;
}

/** A Game Boy header whose checksum checks out; `color` tells the Color carts apart. */
export function gbHeader(rom) {
  if (rom.length < 0x150) return null;
  let x = 0;
  for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  if (x !== rom[0x14d]) return null;
  const cgb = rom[0x143];
  const color = cgb === 0x80 || cgb === 0xc0;
  // On Color-era carts 0x13F..0x142 is a manufacturer code: the title stops before it.
  const title = ascii(rom, 0x134, color ? 11 : 16);
  return { title, color, colorOnly: cgb === 0xc0, version: rom[0x14c] };
}

const baseName = (fileName) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const extOf = (fileName) => (/\.[^.]+$/.exec(fileName)?.[0] ?? '').toLowerCase();
const usable = (text) => text.length >= 2 && /[A-Za-z0-9]/.test(text);

/** Which handheld a ROM is for: its header, else its extension. */
export function platformOf(bytes, fileName = 'rom.gba') {
  if (gbaHeader(bytes)) return 'gba';
  const gb = gbHeader(bytes);
  if (gb) return gb.color ? 'gbc' : 'gb';
  const ext = extOf(fileName);
  return ext === '.gb' || ext === '.sgb' ? 'gb' : ext === '.gbc' || ext === '.cgb' ? 'gbc' : 'gba';
}

/**
 * What the launcher needs to file a ROM: which game it is (`gameId`), how to show it,
 * how to tell its versions apart, and which handheld it is for (`platform`).
 */
export function identify(bytes, fileName = 'rom.gba') {
  const name = baseName(fileName);
  const gba = gbaHeader(bytes);
  const gb = gba ? null : gbHeader(bytes);
  const header = gba ?? gb;
  const title = header?.title ?? '';
  const rawTitle = usable(title) ? title : name.replace(/[_.]+/g, ' ');
  const base = stripVersion(rawTitle) || rawTitle;
  return {
    system: SYSTEM.id,
    platform: platformOf(bytes, fileName),
    gameId: slug(base),
    title: displayTitle(base),
    serial: gba?.code || null,
    revision: header?.version ? String(header.version).padStart(2, '0') : null,
    name,
  };
}

/** The on-screen pad for a version in the library: Game Boy carts get the Game Boy's. */
export const touchSystemOf = (version) => {
  const ext = extOf(version?.file ?? '');
  return version?.platform ?? (ext === '.gb' || ext === '.sgb' ? 'gb' : ext === '.gbc' || ext === '.cgb' ? 'gbc' : 'gba');
};
