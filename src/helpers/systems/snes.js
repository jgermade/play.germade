// Super Nintendo / Super Famicom ROM identification — pure functions, no I/O.
//
// A cartridge describes itself in its internal header, whose place depends on how the
// board maps the ROM:
//   LoROM 0x7FC0 · HiROM 0xFFC0 · ExHiROM 0x40FFC0  (+512 when a copier header leads)
//   +0x00 title (21 bytes)  +0x15 map mode  +0x16 chips  +0x17 ROM size  +0x19 country
//   +0x1B version  +0x1C checksum complement  +0x1E checksum
// No flag says which layout a dump uses, so each candidate is scored the way emulators
// do it, and the best one wins. A DAT match (ROM Manager's dataset) still comes first.

import { displayTitle, slug, stripVersion } from './mega-drive.js';

export const SYSTEM = {
  id: 'snes',
  title: 'Super Nintendo',
  extensions: ['.sfc', '.smc', '.fig', '.swc'],
};

const CANDIDATES = [
  { layout: 'lorom', at: 0x7fc0, modes: [0x20, 0x30, 0x22, 0x32, 0x23, 0x33] },
  { layout: 'hirom', at: 0xffc0, modes: [0x21, 0x31, 0x25, 0x35, 0x2a, 0x3a] },
  { layout: 'exhirom', at: 0x40ffc0, modes: [0x25, 0x35] },
];

const ascii = (bytes, start, length) => {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    const c = bytes[i];
    out += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
};

const word = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);

/** How much a header candidate looks like the real one. */
function score(rom, { at, modes }) {
  if (rom.length < at + 0x40) return -1;
  let points = 0;
  if (modes.includes(rom[at + 0x15])) points += 3;
  if (((word(rom, at + 0x1c) ^ word(rom, at + 0x1e)) & 0xffff) === 0xffff) points += 4;
  const title = rom.subarray(at, at + 21);
  if (title.every((c) => c >= 0x20 && c < 0x7f)) points += 2;
  if (rom[at + 0x17] >= 0x07 && rom[at + 0x17] <= 0x0d) points += 1; // 128 KB – 8 MB
  // The reset vector points into the ROM's upper half of a bank.
  if (word(rom, at + 0x3c) >= 0x8000) points += 1;
  return points;
}

/** The header that fits best, or null when none fits at all. */
export function findHeader(bytes) {
  const rom = bytes.length % 1024 === 512 ? bytes.subarray(512) : bytes;
  let best = null;
  for (const candidate of CANDIDATES) {
    const points = score(rom, candidate);
    if (points > 0 && (!best || points > best.points)) best = { ...candidate, points, rom };
  }
  return best && best.points >= 4 ? best : null;
}

const baseName = (fileName) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const usable = (text) => text.length >= 2 && /[A-Za-z0-9]/.test(text);

/**
 * What the launcher needs to file a ROM: which game it is (`gameId`), how to show it,
 * and how to tell its versions apart (the header's version byte, as Mega Drive's revision).
 */
export function identify(bytes, fileName = 'rom.sfc') {
  const name = baseName(fileName);
  const header = findHeader(bytes);
  const title = header ? ascii(header.rom, header.at, 21) : '';
  const rawTitle = usable(title) ? title : name.replace(/[_.]+/g, ' ');
  const version = header ? header.rom[header.at + 0x1b] : null;
  const base = stripVersion(rawTitle) || rawTitle;
  return {
    system: SYSTEM.id,
    gameId: slug(base),
    title: displayTitle(base),
    serial: null,
    revision: version ? String(version).padStart(2, '0') : null,
    name,
    layout: header?.layout ?? null,
    copierHeader: bytes.length % 1024 === 512,
  };
}
