// The per-system ROM library: what the emulator drawers show.
//
// ROMs belong to the system, not to an engine — two cores play the same Mega Drive
// ROMs — so they live in the launcher's own OPFS folder:
//
//   library/<system>/roms/<sha1>.<ext>   each file once, content-addressed
//   library/<system>/index.json          games → versions (+ the chosen core)
//
// Saves stay with the engine that wrote them: <engine>/<gameId>/.

import { $reactive } from 'jq79';
import * as megaDrive from '../data/systems/mega-drive.js';
import { readZip } from './zip.js';
import { opfsAvailable, readFile, removeFile, requestPersistence, writeFile } from './storage.js';

const SYSTEMS = { [megaDrive.SYSTEM.id]: megaDrive };
const GENERIC_NAMES = /^(rom|game|cart|image)$/i;

/** system id → { loaded, core, games: [{ id, title, core, versions: [...] }] } */
export const roms = $reactive({});

const dirOf = (system) => `library/${system}`;
const empty = () => ({ core: null, games: {} });

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

/** The reactive view of an index: games as a sorted list, versions newest first. */
function publish(system, index) {
  roms[system] = {
    loaded: true,
    core: index.core ?? null,
    games: Object.entries(index.games)
      .map(([id, game]) => ({ id, ...game, versions: megaDrive.sortVersions(game.versions) }))
      .filter((game) => game.versions.length > 0)
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export async function load(system) {
  publish(system, opfsAvailable() ? await readIndex(system) : empty());
  return roms[system];
}

async function sha1(bytes) {
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const extOf = (name) => (/\.[^.\\/]+$/.exec(name)?.[0] ?? '').toLowerCase();

/** Expand picked files: ROMs as they are, the ROMs inside any .zip. */
async function* candidates(files, extensions) {
  for (const file of files) {
    const ext = extOf(file.name);
    if (ext === '.zip') {
      const archive = file.name.replace(/\.zip$/i, '');
      for (const entry of readZip(await file.arrayBuffer())) {
        if (!extensions.includes(extOf(entry.name))) continue;
        const inner = entry.name.replace(/^.*\//, '');
        const base = inner.replace(/\.[^.]+$/, '');
        // "rom.bin" inside "FFMD_095b.zip" is better known by the archive's name.
        const name = GENERIC_NAMES.test(base) ? `${archive}${extOf(inner)}` : inner;
        yield { name, bytes: await entry.bytes() };
      }
    } else if (extensions.includes(ext)) {
      yield { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    } else {
      yield { name: file.name, bytes: null };
    }
  }
}

/**
 * Add ROMs to a system's library. Returns what happened to each file, so the drawer
 * can say it: `{ added: [titles], duplicates: [names], rejected: [names] }`.
 */
export async function importFiles(system, files) {
  const spec = SYSTEMS[system];
  if (!spec) throw new Error(`Sistema desconocido: ${system}`);
  const index = await readIndex(system);
  const known = new Set(Object.values(index.games).flatMap((g) => g.versions.map((v) => v.sha1)));
  const result = { added: [], duplicates: [], rejected: [] };

  for await (const { name, bytes } of candidates(files, spec.SYSTEM.extensions)) {
    if (!bytes || bytes.length < 0x200) {
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
      serial: id.serial,
      revision: id.revision,
      addedAt: Date.now(),
    });
    known.add(hash);
    result.added.push(id.title);
  }

  await writeIndex(system, index);
  await requestPersistence();
  publish(system, index);
  return result;
}

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
  return game ? { index, game: { id: gameId, ...game, versions: megaDrive.sortVersions(game.versions) } } : null;
}
