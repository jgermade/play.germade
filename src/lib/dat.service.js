// What ROM Manager knows about a ROM: its DAT entry (No-Intro, matched by CRC32 and
// size, never by name) and its boxarts, one per region.
//
// The data is ROM Manager's own dataset, slimmed at build time into
// /datasets/<system>.json (scripts/fetch-datasets.mjs); names are read with ROM
// Manager's own rules (src/helpers/rom-manager/), so a game is called and grouped
// here exactly as it is there.
//
// Boxarts are fetched once and kept in OPFS: launcher/covers/<system>/<game>.<region>.png

import { normalizeGameName, parseGameName, variantKey } from '../helpers/rom-manager/rom-grouping.js';
import { regionsOf, videoStandardsOf } from '../helpers/rom-manager/rom-regions.js';
import { readFile, writeFile } from './storage.js';

import { REGIONS, coverCandidates, regionOrder } from '../helpers/covers.js';

export { REGIONS };

const loaded = new Map(); // dataset → Promise<{ byCrc, covers, boxarts } | null>

/**
 * A library that holds several of ROM Manager's systems reads all their datasets: the
 * GBA library also takes Game Boy and Game Boy Color carts (mGBA plays the three).
 */
const DATASETS = { gba: ['gba', 'gbc', 'gb'] };
export const datasetsOf = (system) => DATASETS[system] ?? [system];

/** The system's dataset, or null when there is none (identification falls back to headers). */
export function dataset(system) {
  if (!loaded.has(system)) {
    loaded.set(
      system,
      fetch(`/datasets/${system}.json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return null;
          const byCrc = new Map();
          for (const [crc, size, name, boxart] of data.roms) {
            const list = byCrc.get(crc);
            const entry = { crc, size, name, boxart };
            if (list) list.push(entry);
            else byCrc.set(crc, [entry]);
          }
          return { byCrc, covers: data.covers ?? {}, boxarts: data.boxarts ?? '' };
        })
        .catch(() => null),
    );
  }
  return loaded.get(system);
}

const hex8 = (crc) => (crc >>> 0).toString(16).toUpperCase().padStart(8, '0');

/**
 * The DAT entry for a ROM, by checksum — CRC32 and, as ROM Manager does, the size
 * on top (32 bits alone collide). Null when the catalogue does not know it
 * (homebrew, hacks, bad dumps).
 */
export async function match(system, crc, size) {
  for (const name of datasetsOf(system)) {
    const data = await dataset(name);
    const list = data?.byCrc.get(hex8(crc));
    const entry = list?.find((e) => !e.size || !size || e.size === size);
    if (entry) return describe(entry, data);
  }
  return null;
}

/** A DAT entry read with ROM Manager's rules: title, variant key, regions. */
export function describe(entry, data) {
  const parsed = parseGameName(entry.name);
  return {
    name: entry.name,
    title: normalizeGameName(entry.name),
    key: variantKey(parsed),
    regions: regionsOf(parsed.regions),
    video: videoStandardsOf(parsed.regions),
    revision: parsed.revision ?? null,
    flags: parsed.flags,
    boxart: entry.boxart ? data.boxarts + entry.boxart : null,
  };
}

/**
 * A game's boxarts by region, picked as ROM Manager does: the box of a release the
 * player has comes first (it is the box they own), then the game-level ones.
 */
export async function coversOf(system, game) {
  const data = await dataset(system);
  const byRegion = {};
  let world = null;
  for (const version of game.versions) {
    const dat = version.dat;
    if (!dat?.boxart) continue;
    for (const region of dat.regions?.length ? dat.regions : REGIONS) byRegion[region] ??= dat.boxart;
  }
  const title = normalizeGameName(game.versions.find((v) => v.dat)?.dat.title ?? game.title);
  for (const name of datasetsOf(system)) {
    const data = await dataset(name);
    const level = data?.covers[title] ?? {};
    for (const region of REGIONS) if (level[region]) byRegion[region] ??= data.boxarts + level[region];
    // The World box (`*`): no region, tried last.
    if (level['*']) world ??= data.boxarts + level['*'];
  }
  return { byRegion, world };
}

export { regionOrder };

const pending = new Map();

/**
 * The cover to show for a game as `{ url, region }` (a blob URL), or null. Taken
 * from OPFS when it was fetched before, else downloaded once and kept.
 */
export async function cover(system, game, preferred = 'EU') {
  const { byRegion, world } = await coversOf(system, game);
  const owned = game.versions.flatMap((v) => v.dat?.regions ?? []);
  // The player's own regions first, in the preferred order; then the rest; the World box last.
  for (const { region, url } of coverCandidates(byRegion, world, owned, preferred)) {
    // By its key (rom-manager system + gameId): Tetris on Game Boy and on GBA are two games.
    const blob = await stored(system, (game.key ?? game.id).replace(':', '.'), region ?? 'world', url);
    if (blob) return { url: URL.createObjectURL(blob), region };
  }
  return null;
}

/**
 * A boxart, following libretro-thumbnails' symlinks: a box shared by several releases is a
 * git symlink there, which raw.githubusercontent.com serves as a short text body holding the
 * target's file name. Followed once, never twice.
 */
async function fetchImage(url, hops = 1) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (blob.type.startsWith('image/') || blob.size > 512) return blob;
  const target = (await blob.text()).trim();
  if (hops <= 0 || !/^[^/\\]+\.(png|jpe?g)$/i.test(target)) return null;
  return fetchImage(new URL(encodeURIComponent(target), url).href, hops - 1);
}

async function stored(system, gameId, region, url) {
  const dir = `launcher/covers/${system}`;
  const name = `${gameId}.${region}.png`;
  const file = await readFile(dir, name);
  if (file && file.size) return file;
  const key = `${dir}/${name}`;
  if (!pending.has(key)) {
    pending.set(
      key,
      fetchImage(url)
        .then(async (blob) => {
          if (blob) await writeFile(dir, name, blob).catch(() => {});
          return blob;
        })
        .catch(() => null)
        .finally(() => pending.delete(key)),
    );
  }
  return pending.get(key);
}
