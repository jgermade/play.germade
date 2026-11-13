// The per-system ROM library: what the emulator drawers show.
//
// ROMs belong to the system, not to an engine — two cores play the same Mega Drive
// ROMs — so they live in the launcher's own OPFS folder:
//
//   library/<system>/roms/<sha1>.<ext>      each file once, content-addressed
//   library/<system>/patches/<sha1>.<ext>   each mod (IPS / BPS / UPS) once
//   library/<system>/index.json             games → versions (+ the chosen core), mods
//
// Mods are never applied in place: the player applies one in memory while loading.
//
// Saves stay with the engine that wrote them: <engine>/<gameId>/.

import { $reactive } from 'jq79';
import * as megaDrive from '../data/systems/mega-drive.js';
import { readZip } from './zip.js';
import { PATCH_EXTENSIONS, applyPatch, crc32, formatOf, hex, parsePatch } from './patch.js';
import { opfsAvailable, readFile, removeFile, requestPersistence, writeFile } from './storage.js';

const SYSTEMS = { [megaDrive.SYSTEM.id]: megaDrive };
const GENERIC_NAMES = /^(rom|game|cart|image)$/i;

/**
 * system id → { loaded, core, games: [{ id, title, core, versions: [...], mods: [...] }],
 *               unassigned: [mod…] }
 */
export const roms = $reactive({});

export const systems = () => Object.values(SYSTEMS).map((spec) => spec.SYSTEM);

const dirOf = (system) => `library/${system}`;
const empty = () => ({ core: null, games: {}, mods: {} });

async function readIndex(system) {
  const file = await readFile(dirOf(system), 'index.json');
  if (!file) return empty();
  try {
    return { ...empty(), ...JSON.parse(await file.text()) };
  } catch {
    return empty();
  }
}

async function writeIndex(system, index) {
  await writeFile(dirOf(system), 'index.json', new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' }));
}

/**
 * How a mod stands against a game's versions:
 *   'verified'   BPS / UPS whose source CRC is one of the game's versions (→ `target`)
 *   'mismatch'   BPS / UPS for none of them
 *   'unverified' IPS (no checksum): it applies to the version picked
 */
export function modStatus(mod, game) {
  if (mod.format === 'ips' || mod.sourceCrc == null) return 'unverified';
  return game?.versions.some((v) => v.crc32 === mod.sourceCrc) ? 'verified' : 'mismatch';
}

/** The version a mod is played on: the one it was made for, else the chosen / newest. */
export function versionForMod(mod, game) {
  return (
    game.versions.find((v) => mod.sourceCrc != null && v.crc32 === mod.sourceCrc) ??
    game.versions.find((v) => v.sha1 === mod.target) ??
    game.versions[0]
  );
}

const modView = (sha1, mod, game) => ({ sha1, ...mod, status: modStatus(mod, game) });

/** The reactive view of an index: games as a sorted list, versions newest first. */
function publish(system, index) {
  const mods = Object.entries(index.mods ?? {});
  roms[system] = {
    loaded: true,
    core: index.core ?? null,
    games: Object.entries(index.games)
      .map(([id, game]) => {
        const view = { id, ...game, versions: megaDrive.sortVersions(game.versions) };
        view.mods = mods
          .filter(([, mod]) => mod.gameId === id)
          .map(([sha1, mod]) => modView(sha1, mod, view))
          .sort((a, b) => a.name.localeCompare(b.name));
        return view;
      })
      .filter((game) => game.versions.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title)),
    unassigned: mods
      .filter(([, mod]) => !mod.gameId || !index.games[mod.gameId])
      .map(([sha1, mod]) => modView(sha1, mod, null)),
  };
}

export async function load(system) {
  if (!opfsAvailable()) {
    publish(system, empty());
    return roms[system];
  }
  const index = await readIndex(system);
  publish(system, index);
  // Libraries from before CRC32 was recorded: fill it in, so mods can be matched.
  if (await ensureCrcs(system, index)) {
    await writeIndex(system, index);
    publish(system, index);
  }
  return roms[system];
}

async function sha1(bytes) {
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const extOf = (name) => (/\.[^.\\/]+$/.exec(name)?.[0] ?? '').toLowerCase();

/** Expand picked files: ROMs and mods as they are, and the ones inside any .zip. */
async function* candidates(files, extensions) {
  for (const file of files) {
    const ext = extOf(file.name);
    if (ext === '.zip') {
      const archive = file.name.replace(/\.zip$/i, '');
      for (const entry of readZip(await file.arrayBuffer())) {
        const innerExt = extOf(entry.name);
        if (PATCH_EXTENSIONS.includes(innerExt)) {
          yield { name: entry.name.replace(/^.*\//, ''), bytes: await entry.bytes(), archive };
          continue;
        }
        if (!extensions.includes(innerExt)) continue;
        const inner = entry.name.replace(/^.*\//, '');
        const base = inner.replace(/\.[^.]+$/, '');
        // "rom.bin" inside "FFMD_095b.zip" is better known by the archive's name.
        const name = GENERIC_NAMES.test(base) ? `${archive}${extOf(inner)}` : inner;
        yield { name, bytes: await entry.bytes() };
      }
    } else if (extensions.includes(ext) || PATCH_EXTENSIONS.includes(ext)) {
      yield { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    } else {
      yield { name: file.name, bytes: null };
    }
  }
}

/** A readable mod name: "Sonic_Hack_v2.bps" → "Sonic Hack v2". */
const modName = (fileName, archive) => {
  const base = fileName.replace(/\.[^.]+$/, '');
  const named = /^(patch|mod|hack)$/i.test(base) && archive ? archive : base;
  return named.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
};

/** Versions imported before CRC32 was recorded get it now (BPS / UPS match by it). */
async function ensureCrcs(system, index) {
  let changed = false;
  for (const game of Object.values(index.games)) {
    for (const version of game.versions) {
      if (version.crc32 != null) continue;
      const file = await readFile(`${dirOf(system)}/roms`, version.file);
      if (!file) continue;
      version.crc32 = crc32(new Uint8Array(await file.arrayBuffer()));
      changed = true;
    }
  }
  return changed;
}

/** The game whose versions include a ROM with this CRC32. */
const gameByCrc = (index, crc) =>
  Object.entries(index.games).find(([, game]) => game.versions.some((v) => v.crc32 === crc))?.[0] ?? null;

/**
 * Add ROMs and mods to a system's library — one door for both, zips included. A mod
 * made for a known version (BPS / UPS name it by CRC32) attaches to that game; any
 * other attaches to `gameId` when given (the game open in the manager), else waits in
 * "sin asignar". Returns what happened, for the UI to say:
 * `{ added: [titles], mods: [{ name, gameId, status }], duplicates, rejected }`.
 */
export async function importFiles(system, files, { gameId = null } = {}) {
  const spec = SYSTEMS[system];
  if (!spec) throw new Error(`Sistema desconocido: ${system}`);
  const index = await readIndex(system);
  index.mods ??= {};
  await ensureCrcs(system, index);
  const known = new Set(Object.values(index.games).flatMap((g) => g.versions.map((v) => v.sha1)));
  const result = { added: [], mods: [], duplicates: [], rejected: [] };
  const pendingMods = [];

  for await (const { name, bytes, archive } of candidates(files, spec.SYSTEM.extensions)) {
    if (bytes && formatOf(bytes)) {
      pendingMods.push({ name, bytes, archive });
      continue;
    }
    if (!bytes || bytes.length < 0x200 || PATCH_EXTENSIONS.includes(extOf(name))) {
      result.rejected.push(name);
      continue;
    }
    const hash = await sha1(bytes);
    if (known.has(hash)) {
      result.duplicates.push(name);
      continue;
    }
    const id = spec.identify(bytes, name);
    const file = `${hash}${extOf(name) || '.bin'}`;
    await writeFile(`${dirOf(system)}/roms`, file, new Blob([bytes]));
    const game = (index.games[id.gameId] ??= { title: id.title, core: null, versions: [] });
    game.versions.push({
      sha1: hash,
      file,
      name: id.name,
      size: bytes.length,
      crc32: crc32(bytes),
      serial: id.serial,
      revision: id.revision,
      addedAt: Date.now(),
    });
    known.add(hash);
    result.added.push(id.title);
  }

  // Mods after ROMs, so a ROM and its mod dropped together find each other.
  for (const { name, bytes, archive } of pendingMods) {
    const hash = await sha1(bytes);
    if (index.mods[hash]) {
      result.duplicates.push(name);
      continue;
    }
    let info;
    try {
      info = parsePatch(bytes);
    } catch {
      result.rejected.push(name);
      continue;
    }
    if (!info.valid) {
      result.rejected.push(`${name} (dañado)`);
      continue;
    }
    const owner = (info.sourceCrc != null && gameByCrc(index, info.sourceCrc)) || (gameId && index.games[gameId] ? gameId : null);
    const file = `${hash}.${info.format}`;
    await writeFile(`${dirOf(system)}/patches`, file, new Blob([bytes]));
    index.mods[hash] = {
      name: modName(name, archive),
      file,
      format: info.format,
      size: bytes.length,
      gameId: owner,
      target: null,
      sourceCrc: info.sourceCrc,
      targetCrc: info.targetCrc,
      addedAt: Date.now(),
    };
    result.mods.push({ name: index.mods[hash].name, gameId: owner, status: modStatus(index.mods[hash], owner ? index.games[owner] : null) });
  }

  await writeIndex(system, index);
  await requestPersistence();
  publish(system, index);
  return result;
}

/** Give a mod to a game (or take it back to "sin asignar" with null). */
export async function assignMod(system, modSha1, gameId) {
  const index = await readIndex(system);
  const mod = index.mods?.[modSha1];
  if (!mod) return;
  mod.gameId = gameId && index.games[gameId] ? gameId : null;
  await writeIndex(system, index);
  publish(system, index);
}

export async function renameMod(system, modSha1, name) {
  const index = await readIndex(system);
  const mod = index.mods?.[modSha1];
  if (!mod || !name?.trim()) return;
  mod.name = name.trim();
  await writeIndex(system, index);
  publish(system, index);
}

/** Remove a mod's file. Saves made with it stay in the engine's `<game>+<mod>` folder. */
export async function removeMod(system, modSha1) {
  const index = await readIndex(system);
  const mod = index.mods?.[modSha1];
  if (!mod) return;
  delete index.mods[modSha1];
  await removeFile(`${dirOf(system)}/patches`, mod.file);
  await writeIndex(system, index);
  publish(system, index);
}

/** Rename a game (the title the library shows; its id — and so its saves — stay). */
export async function renameGame(system, gameId, title) {
  const index = await readIndex(system);
  if (!index.games[gameId] || !title?.trim()) return;
  index.games[gameId].title = title.trim();
  await writeIndex(system, index);
  publish(system, index);
}

/**
 * The bytes to play: a version, with a mod applied in memory when asked. Throws the
 * patcher's own message when the mod does not fit — never a silent unpatched ROM.
 */
export async function readRomWithMod(system, version, mod) {
  const rom = await readRom(system, version);
  if (!mod) return rom;
  const file = await readFile(`${dirOf(system)}/patches`, mod.file);
  if (!file) throw new Error(`Falta el mod ${mod.name} en la biblioteca`);
  return applyPatch(rom, new Uint8Array(await file.arrayBuffer()));
}

/** Library totals for the manager's footer. */
export function totals(system) {
  const view = roms[system];
  if (!view) return { games: 0, versions: 0, mods: 0, bytes: 0 };
  const versions = view.games.flatMap((g) => g.versions);
  const mods = view.games.flatMap((g) => g.mods).concat(view.unassigned);
  return {
    games: view.games.length,
    versions: versions.length,
    mods: mods.length,
    bytes: versions.reduce((n, v) => n + v.size, 0) + mods.reduce((n, m) => n + m.size, 0),
  };
}

export { hex };

/** Remove one version's file. The game's saves (in the engine's folder) are kept. */
export async function removeVersion(system, gameId, hash) {
  const index = await readIndex(system);
  const game = index.games[gameId];
  if (!game) return;
  const version = game.versions.find((v) => v.sha1 === hash);
  game.versions = game.versions.filter((v) => v.sha1 !== hash);
  if (game.versions.length === 0) delete index.games[gameId];
  if (version) await removeFile(`${dirOf(system)}/roms`, version.file);
  await writeIndex(system, index);
  publish(system, index);
}

/** The console's core (gameId omitted) or one game's (null = follow the console). */
export async function setCore(system, core, gameId = null) {
  const index = await readIndex(system);
  if (gameId) {
    if (!index.games[gameId]) return;
    index.games[gameId].core = core;
  } else {
    index.core = core;
  }
  await writeIndex(system, index);
  publish(system, index);
}

/** Which core plays a game: the game's choice, then the console's, then the default. */
export const coreFor = (entry, game, fallback) => game?.core ?? entry?.core ?? fallback;

/** One version's bytes, for the player. */
export async function readRom(system, version) {
  const file = await readFile(`${dirOf(system)}/roms`, version.file);
  if (!file) throw new Error(`Falta la ROM ${version.name} en la biblioteca`);
  return new Uint8Array(await file.arrayBuffer());
}

/** The raw index entry for one game (the player reads it without the reactive view). */
export async function findGame(system, gameId) {
  const index = await readIndex(system);
  const game = index.games[gameId];
  if (!game) return null;
  const view = { id: gameId, ...game, versions: megaDrive.sortVersions(game.versions) };
  view.mods = Object.entries(index.mods ?? {})
    .filter(([, mod]) => mod.gameId === gameId)
    .map(([sha1, mod]) => modView(sha1, mod, view));
  return { index, game: view };
}
