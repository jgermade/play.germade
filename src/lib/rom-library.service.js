// The emulators' ROM library: what the drawers show and the routes play.
//
// The library is rom-manager's — served by this site at /roms/ — and this file reads it
// through rom-manager's own module, `/roms/roms-sdk.js`, loaded at run time the way the
// routes load engine apps. Nothing about ROMs is re-implemented here: the intake, the
// DATs, the mods and the index are rom-manager's. What stays here is what the launcher
// adds on top: the reactive view per launcher system, the engine chosen per system and
// per game (`launcher/library-prefs.json`), and the covers (dat.service.js).
//
//   rom-manager/library/<System>/…                   the ROMs (rom-manager's layout)
//   rom-manager/library/.meta/<System>/index.json    games → versions (by CRC32), mods
//
// Saves stay with the engine that wrote them: <engine>/<gameId>/ (and
// <engine>/<gameId>+<mod sha1:8>/ with a mod).

import { $reactive } from 'jq79';
import { SYSTEMS, touchSystemFor as padFor } from '../helpers/systems.js';
import { crcNumber, extensionSystemOf, gamesOf, launcherSystemsOf, versionForMod as pickVersionForMod } from '../helpers/library-view.js';
import * as dat from './dat.service.js';
import { opfsAvailable, readFile, removeDirectory, requestPersistence, writeFile } from './storage.js';

export { modStatus, playQuery } from '../helpers/library-view.js';

// Not exported: this module is handed to views as a namespace, and jq79 proxies it (plain
// arrays and objects on it break the proxy; functions and $reactive stores are fine).
const OLD_SYSTEMS = Object.keys(SYSTEMS);

/**
 * launcher system id → { loaded, core, games: [{ id, key, system, title, core, versions, mods }],
 *                        unassigned: [mod…], bios }
 */
export const roms = $reactive({});

/** The move of the old library (`library/<system>/`) into rom-manager's, once. */
export const moving = $reactive({ running: false, report: null, error: null });

export const systems = () => Object.values(SYSTEMS);

// ── rom-manager's module ────────────────────────────────────────────────────────

// A URL in a variable: the module is the deployed /roms/ build's, never bundled here.
const SDK_URL = '/roms/roms-sdk.js';
let sdkPromise = null;
/** `/roms/roms-sdk.js`, imported once. */
export function sdk() {
  sdkPromise ??= import(/* @vite-ignore */ SDK_URL).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

// ── The engine chosen per system and per game ───────────────────────────────────

const PREFS_DIR = 'launcher';
const PREFS_FILE = 'library-prefs.json';
let prefsCache = null;

async function readPrefs() {
  if (prefsCache) return prefsCache;
  const file = await readFile(PREFS_DIR, PREFS_FILE);
  try {
    prefsCache = file ? JSON.parse(await file.text()) : {};
  } catch {
    prefsCache = {};
  }
  prefsCache.systems ??= {};
  prefsCache.games ??= {};
  return prefsCache;
}

async function writePrefs(prefs) {
  prefsCache = prefs;
  await writeFile(PREFS_DIR, PREFS_FILE, new Blob([JSON.stringify(prefs, null, 2)], { type: 'application/json' }));
}

// ── The view ────────────────────────────────────────────────────────────────────

const empty = (system) => ({ loaded: true, core: null, games: [], unassigned: [], bios: null, system });

/** Reads a launcher system's games from rom-manager's indexes (several for /gba/). */
async function build(system) {
  const lib = await sdk();
  const indexes = (await lib.readIndexes()).filter((index) => launcherSystemsOf(index.system).includes(system));
  const prefs = await readPrefs();
  const view = gamesOf(system, indexes, prefs);
  // The DAT entry of each version (its release key and its boxart), from the slim dataset.
  for (const game of view.games) {
    for (const version of game.versions) version.dat = await dat.match(system, crcNumber(version.crc), version.size);
  }
  return view;
}

export async function load(system) {
  if (!opfsAvailable()) {
    roms[system] = empty(system);
    return roms[system];
  }
  await migrateOnce();
  try {
    roms[system] = { loaded: true, system, ...(await build(system)) };
  } catch (error) {
    // /roms/ not deployed (a dev server without it), or a storage error: an empty library
    // that says why, never a broken page.
    roms[system] = { ...empty(system), error: error.message ?? String(error) };
  }
  return roms[system];
}

const reload = (system) => load(system);

/** The game (and the launcher-side view of it) a route plays. `rmSystem` picks it inside /gba/. */
export async function findGame(system, gameId, rmSystem = null) {
  const view = roms[system]?.loaded ? roms[system] : await load(system);
  const game =
    view.games.find((g) => g.id === gameId && (!rmSystem || g.system === rmSystem)) ??
    view.games.find((g) => g.id === gameId) ??
    null;
  return game ? { index: { core: view.core }, game } : null;
}

/** The version a mod is played on: the one it fits, else the newest. */
export const versionForMod = pickVersionForMod;

/**
 * The bytes to play: a version, with a mod applied in memory when asked. Throws the
 * patcher's own reason when the mod does not fit — never a silent unpatched ROM.
 */
export async function readRomWithMod(system, version, mod) {
  const lib = await sdk();
  const { rom } = await lib.readRomWithMod(version.path, mod?.path);
  return rom;
}

/** The system's BIOS (Neo Geo: neogeo.zip), or null. */
export async function readBios(system) {
  const driver = SYSTEMS[system]?.biosDriver;
  if (!driver) return null;
  const path = roms[system]?.bios?.path ?? `NEOGEO/${driver}.zip`;
  try {
    return await (await sdk()).readFile(path);
  } catch {
    return null;
  }
}

/** Add ROMs and mods: rom-manager's intake (DATs, zips, mods), through its module. */
export async function importFiles(system, files, { gameId = null } = {}) {
  const lib = await sdk();
  const result = await lib.addFiles([...files], { system: (name) => extensionSystemOf(system, name), gameId: gameId ?? undefined });
  await requestPersistence();
  await reload(system);
  return {
    added: result.added,
    duplicates: result.already,
    rejected: result.refused.map((r) => r.name).concat(result.mods.rejected.map((r) => r.name)),
    mods: result.mods.added,
    bios: result.added.some((path) => /\/neogeo\.zip$/i.test(path)) ? 'aes' : null,
  };
}

/** Remove one version's file. The game's saves (in the engine's folder) are kept. */
export async function removeVersion(system, version) {
  await (await sdk()).removeVersion(version.path);
  await reload(system);
}

/** Remove a mod. Saves made with it stay in the engine's `<game>+<mod>` folder. */
export async function removeMod(system, mod) {
  await (await sdk()).removeMod(mod.system, mod.sha1);
  await reload(system);
}

/** A game's cover (blob URL + region), from OPFS or fetched once: see dat.service.js. */
export const coverOf = (system, game, region) => dat.cover(system, game, region);

/** The on-screen pad a version wants: the system's own, unless its module says otherwise. */
export const touchSystemFor = padFor;

/** The console's core (gameId omitted) or one game's (null = follow the console). */
export async function setCore(system, core, gameId = null) {
  const prefs = { ...(await readPrefs()) };
  if (gameId) {
    const games = { ...prefs.games };
    if (core) games[`${system}/${gameId}`] = core;
    else delete games[`${system}/${gameId}`];
    prefs.games = games;
  } else {
    prefs.systems = { ...prefs.systems, [system]: core };
  }
  await writePrefs(prefs);
  await reload(system);
}

/** Which core plays a game: the game's choice, then the console's, then the default. */
export const coreFor = (entry, game, fallback) => game?.core ?? entry?.core ?? fallback;

// ── The old library, moved in once ──────────────────────────────────────────────

let migration = null;

/**
 * play.germade's own library (`library/<system>/`, before rom-manager was its /roms/):
 * rom-manager moves it in (ROMs through its intake, mods, renamed titles), the engine
 * choices are kept here, and the old folder is deleted.
 */
export function migrateOnce() {
  migration ??= (async () => {
    if (!opfsAvailable()) return;
    const old = [];
    for (const system of OLD_SYSTEMS) {
      const file = await readFile(`library/${system}`, 'index.json');
      if (!file) continue;
      try {
        old.push({ system, index: JSON.parse(await file.text()) });
      } catch {
        old.push({ system, index: null });
      }
    }
    if (old.length === 0) return;
    moving.running = true;
    try {
      const lib = await sdk();
      if (!(await lib.migrated())) moving.report = (await lib.migrateFromPlayGermade()) ?? null;
      // The engine choices of the old index, before it goes.
      const prefs = { ...(await readPrefs()) };
      for (const { system, index } of old) {
        if (!index) continue;
        if (index.core && !prefs.systems[system]) prefs.systems = { ...prefs.systems, [system]: index.core };
        for (const [gameId, game] of Object.entries(index.games ?? {})) {
          const key = `${system}/${gameId}`;
          if (game?.core && !prefs.games[key]) prefs.games = { ...prefs.games, [key]: game.core };
        }
      }
      await writePrefs(prefs);
      if (await lib.migrated()) await removeDirectory('library');
    } catch (error) {
      // Nothing is deleted when anything failed: the next start tries again.
      moving.error = error.message ?? String(error);
      migration = null;
    } finally {
      moving.running = false;
    }
  })();
  return migration;
}
