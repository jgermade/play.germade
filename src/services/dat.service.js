// What ROM Manager knows about a ROM: its DAT entry (No-Intro, matched by CRC32 and
// size, never by name) and its boxarts, one per region.
//
// The data is ROM Manager's own dataset, slimmed at build time into
// /datasets/<system>.json (scripts/fetch-datasets.mjs); names are read with ROM
// Manager's own rules (src/vendor/rom-manager/), so a game is called and grouped
// here exactly as it is there.
//
// Boxarts are fetched once and kept in OPFS: library/<system>/covers/<gameId>.<region>.png

import { normalizeGameName, parseGameName, variantKey } from '../vendor/rom-manager/rom-grouping.js';
import { regionsOf, videoStandardsOf } from '../vendor/rom-manager/rom-regions.js';
import { readFile, writeFile } from './storage.js';

export const REGIONS = ['EU', 'US', 'JP'];

const loaded = new Map(); // system → Promise<{ byCrc, covers, boxarts } | null>

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
  const data = await dataset(system);
  const list = data?.byCrc.get(hex8(crc));
  const entry = list?.find((e) => !e.size || !size || e.size === size);
  return entry ? describe(entry, data) : null;
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
  for (const version of game.versions) {
    const dat = version.dat;
    if (!dat?.boxart) continue;
    for (const region of dat.regions?.length ? dat.regions : REGIONS) byRegion[region] ??= dat.boxart;
  }
  const title = game.versions.find((v) => v.dat)?.dat.title ?? game.title;
  const level = data?.covers[normalizeGameName(title)] ?? {};
  for (const region of REGIONS) if (level[region]) byRegion[region] ??= data.boxarts + level[region];
  return byRegion;
}

/** The regions to try, preferred first: ROM Manager's EU / US / JP switch. */
export const regionOrder = (preferred = 'EU') => [preferred, ...REGIONS.filter((r) => r !== preferred)];

const pending = new Map();

/**
 * The cover to show for a game as `{ url, region }` (a blob URL), or null. Taken
 * from OPFS when it was fetched before, else downloaded once and kept.
 */
export async function cover(system, game, preferred = 'EU') {
  const covers = await coversOf(system, game);
  const owned = new Set(game.versions.flatMap((v) => v.dat?.regions ?? []));
  const order = regionOrder(preferred);
  // The player's own regions first, in the preferred order; then the rest.
  const regions = [...order.filter((r) => owned.has(r)), ...order.filter((r) => !owned.has(r))];
  for (const region of regions) {
    if (!covers[region]) continue;
    const blob = await stored(system, game.id, region, covers[region]);
    if (blob) return { url: URL.createObjectURL(blob), region };
  }
  return null;
}

async function stored(system, gameId, region, url) {
  const dir = `library/${system}/covers`;
  const name = `${gameId}.${region}.png`;
  const file = await readFile(dir, name);
  if (file && file.size) return file;
  const key = `${dir}/${name}`;
  if (!pending.has(key)) {
    pending.set(
      key,
      fetch(url, { mode: 'cors' })
        .then((res) => (res.ok ? res.blob() : null))
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
