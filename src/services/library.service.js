// Which games are installed, as reactive state the views read.
//
// "Installed" means every file in the game's `install` list is already in OPFS
// under `<engine>/<slug>/` — the engine-owned folder. Nothing else marks it: no
// side files, no localStorage, so deleting the folder uninstalls the game.

import { $reactive } from 'jq79';
import { GAMES } from '../data/catalog.js';
import { hasFile, removeFile, requestPersistence, storagePath, writeFile } from './storage.js';

export const library = $reactive({
  /** slug → true when all install files are present */
  installed: {},
  persistent: false,
});

const filesOf = (game) => Object.values(game.install ?? {});

export async function refresh(slug) {
  const games = slug ? GAMES.filter((g) => g.slug === slug) : GAMES;
  for (const game of games) {
    if (game.status !== 'ready' || !game.install) continue;
    const path = storagePath(game.engine, game.slug);
    const present = await Promise.all(filesOf(game).map((f) => hasFile(path, f.file)));
    library.installed[game.slug] = present.every(Boolean);
  }
}

/**
 * Stage the files the player picked. `files` maps the install key (the engine's
 * asset name) to a File. Only accepted extensions are written.
 */
export async function install(game, files) {
  const path = storagePath(game.engine, game.slug);
  for (const [key, spec] of Object.entries(game.install ?? {})) {
    const file = files[key];
    if (!file) throw new Error(`Falta ${spec.label ?? spec.file}`);
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (spec.accept && !spec.accept.includes(ext)) {
      throw new Error(`${file.name}: se esperaba ${spec.accept.join(', ')}`);
    }
    await writeFile(path, spec.file, file);
  }
  library.persistent = await requestPersistence();
  await refresh(game.slug);
}

/** Remove the installed data, keeping saves (they live next to it). */
export async function uninstall(game) {
  const path = storagePath(game.engine, game.slug);
  for (const spec of filesOf(game)) await removeFile(path, spec.file);
  await refresh(game.slug);
}
