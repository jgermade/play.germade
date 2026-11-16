// rom-manager's library index (`.meta/<System>/index.json`) as the launcher shows it:
// one view per launcher system, games with their versions (newest first) and mods.
// Pure functions; the reading is lib/rom-library.service.js.

/** rom-manager system → launcher system. mGBA plays the three handhelds at /gba/. */
const LAUNCHER_SYSTEM = { MegaDrive: 'megadrive', SNES: 'snes', GBA: 'gba', GAMEBOY: 'gba', GBC: 'gba', NEOGEO: 'neogeo' };
const PLATFORM = { GBA: 'gba', GAMEBOY: 'gb', GBC: 'gbc' };

/** The launcher systems a rom-manager system feeds (none for systems the launcher cannot play). */
export const launcherSystemsOf = (rmSystem) => (LAUNCHER_SYSTEM[rmSystem] ? [LAUNCHER_SYSTEM[rmSystem]] : []);

/** Where a ROM no DAT knows goes, by the launcher system it was added from and its extension. */
export function extensionSystemOf(system, fileName) {
  const ext = (/\.[^.]+$/.exec(fileName)?.[0] ?? '').toLowerCase();
  if (system === 'megadrive') return 'MegaDrive';
  if (system === 'snes') return 'SNES';
  if (system === 'neogeo') return 'NEOGEO';
  if (system === 'gba') return ext === '.gb' || ext === '.sgb' ? 'GAMEBOY' : ext === '.gbc' || ext === '.cgb' ? 'GBC' : 'GBA';
  return undefined;
}

/** A CRC32 as rom-manager writes it (8 hex digits) → a number. */
export const crcNumber = (hex) => parseInt(hex, 16) >>> 0;

const baseName = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
const isBios = (path) => /(^|\/)neogeo\.zip$/i.test(path);

/**
 * How a mod stands against a game's versions:
 *   'verified'   BPS / UPS whose source is one of the versions here
 *   'mismatch'   BPS / UPS made for a version that is not here
 *   'unverified' IPS (no checksum): it applies to the version picked
 */
export function modStatus(mod) {
  if (mod.fits) return 'verified';
  return mod.sourceCrc ? 'mismatch' : 'unverified';
}

/** The version a mod is played on: the one it fits, else the newest. */
export function versionForMod(mod, game) {
  return game.versions.find((v) => v.crc === mod.fits) ?? game.versions.find((v) => v.crc === mod.sourceCrc) ?? game.versions[0];
}

const byRevision = (a, b) => String(b.revision ?? '').localeCompare(String(a.revision ?? ''), undefined, { numeric: true });

/**
 * The launcher's view of one system from rom-manager's indexes (several for /gba/), with
 * the engine chosen per system and per game (`prefs`: { systems, games: { "<system>/<gameId>": core } }).
 */
export function gamesOf(system, indexes, prefs = {}) {
  const games = [];
  let bios = null;
  for (const index of indexes) {
    for (const [id, game] of Object.entries(index.games ?? {})) {
      const versions = [];
      for (const v of game.versions ?? []) {
        if (isBios(v.path)) {
          bios = { path: v.path, crc: v.crc };
          continue;
        }
        versions.push({
          key: v.crc.toLowerCase(),
          crc: v.crc,
          path: v.path,
          file: v.path,
          size: v.size ?? 0,
          name: v.variant ?? baseName(v.path),
          variant: v.variant ?? null,
          regions: v.regions ?? [],
          revision: v.revision ?? null,
          verified: v.verified === true,
          system: index.system,
          ...(PLATFORM[index.system] ? { platform: PLATFORM[index.system] } : {}),
        });
      }
      if (versions.length === 0) continue;
      versions.sort(byRevision);
      games.push({
        id,
        key: `${index.system}:${id}`,
        system: index.system,
        title: game.title,
        core: prefs.games?.[`${system}/${id}`] ?? null,
        versions,
        mods: (game.mods ?? [])
          .map((mod) => ({ ...mod, system: index.system, status: modStatus(mod) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }
  games.sort((a, b) => a.title.localeCompare(b.title) || a.system.localeCompare(b.system));
  return { core: prefs.systems?.[system] ?? null, games, unassigned: [], bios };
}

/**
 * The query a route plays from: the same link rom-manager's "Jugar" builds,
 * `?system=<rom-manager System>&game=<gameId>&version=<crc32>[&patch=<sha1:8>]`.
 */
export function playQuery({ rmSystem, gameId, version, patch = null }) {
  const q = new URLSearchParams({ ...(rmSystem ? { system: rmSystem } : {}), game: gameId, version: String(version).toLowerCase() });
  if (patch) q.set('patch', patch.slice(0, 8).toLowerCase());
  return q.toString();
}
