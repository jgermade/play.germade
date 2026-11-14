// Neo Geo ROM-set identification — pure functions, no I/O.
//
// Unlike a cartridge dump, an arcade-style Neo Geo game is a *set*: a zip of chip
// dumps that FBNeo finds by its driver name (`mslug.zip`) and checks chip by chip,
// by CRC-32. So the zip is stored whole, and identified the same way: the CRCs in its
// central directory against fbneo-wasm's dataset (`romsets/neogeo.json`, shipped with
// the engine), which also names each set (`t`), its year (`y`) and maker (`m`).
// The `neogeo` set is the BIOS, not a game: it goes apart (route/main.js hands it to
// the engine as `assets.bios`). See RECORD/2026-11-14.neo-geo-on-fbneo.WIP.md.

import { displayTitle, slug } from './mega-drive.js';

export const SYSTEM = {
  id: 'neogeo',
  title: 'Neo Geo',
  extensions: ['.zip', '.neo'],
  /** Archives are the game: stored as they are, never unpacked. */
  whole: true,
};

/** The BIOS set's driver in FBNeo. */
export const BIOS_DRIVER = 'neogeo';

/** What a BIOS zip can boot as the AES (the home console), by CRC. */
const AES_WORLD = 'd27a71f1'; // neo-epo.bin
const AES_JAPAN = '16d0c132'; // neo-po.bin
const UNIBIOS_40 = 'a7aab458'; // uni-bios_4_0.rom

/** `aes` (real AES BIOS), `unibios` (Universe BIOS 4.0, AES mode) or `mvs` (arcade only). */
export function biosKind(crcs) {
  const set = new Set(crcs);
  if (set.has(AES_WORLD) || set.has(AES_JAPAN)) return 'aes';
  if (set.has(UNIBIOS_40)) return 'unibios';
  return 'mvs';
}

const usable = (crc) => /^[0-9a-f]{8}$/.test(crc) && crc !== '00000000';

/** "Garou - Mark of the Wolves (NGM-2530)" → "Garou - Mark of the Wolves". */
export const cleanTitle = (title) => title.replace(/\s*\((?:NG[MH]|ADM|NGM|set|hack|bootleg)[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();

/**
 * The best match for a zip's CRCs in the dataset: the set whose chips the zip covers
 * most (at least 60 % of them, the parent set winning a tie with its clones), or null.
 */
export function bestSet(crcs, dataset) {
  const have = new Set(crcs);
  let best = null;
  for (const [driver, game] of Object.entries(dataset?.games ?? {})) {
    const chips = (game.roms ?? []).map((rom) => rom.c).filter(usable);
    if (!chips.length) continue;
    const found = chips.filter((crc) => have.has(crc)).length;
    const coverage = found / chips.length;
    if (coverage < 0.6) continue;
    const better =
      !best || coverage > best.coverage || (coverage === best.coverage && !game.parent && best.game.parent);
    if (better) best = { driver, game, coverage };
  }
  return best;
}

const baseName = (fileName) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/**
 * What the library files for one archive: the BIOS (`{ bios: kind }`), or a game
 * (`{ gameId, title, year, maker, name, matched }`). `entries` are the zip's
 * `{ crc }` (empty for a `.neo` image, which fbneo's app rebuilds into a set itself).
 */
export function identify(entries, fileName, dataset) {
  const crcs = entries.map((entry) => entry.crc.toLowerCase());
  const name = baseName(fileName);
  const match = crcs.length ? bestSet(crcs, dataset) : null;
  if (match?.driver === BIOS_DRIVER || (!match && /^neogeo$/i.test(name))) {
    return { bios: biosKind(crcs), name };
  }
  if (match) {
    return {
      gameId: match.driver,
      title: cleanTitle(match.game.t ?? match.driver),
      year: match.game.y ?? null,
      maker: match.game.m ?? null,
      name,
      matched: true,
    };
  }
  // Not in FBNeo's list (homebrew, a .neo image): by its file name, like Mega Drive's.
  return { gameId: slug(name), title: displayTitle(name.replace(/[_.]+/g, ' ')), year: null, maker: null, name, matched: false };
}
