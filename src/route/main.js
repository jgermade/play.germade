// A route page: /<slug>/ for a game, /<system>/?game=…&version=…&patch=… for a system.
//
// It resolves what to play from the catalog, the installed files or the system's ROM
// library, then hands everything to the engine's app (`EngineApp.mount(target, host)`
// from @wasm-gaming/engine-specs). Engines that ship no app yet run in the launcher's
// generic app. Leaving goes back through history when we came from the launcher (the
// home is restored as it was), else to the home.

import '@fontsource-variable/inter';
import '@fontsource-variable/unbounded';
import { $reactive } from 'jq79';

import Route from './Route.html';
import InstallDialog from '../components/InstallDialog.html';
import RomDrawer from '../components/RomDrawer.html';
import * as genericApp from './generic-app.js';

import { gameBySlug } from '../data/catalog.js';
import engines from '../data/engines.json';
import { library, refresh, install } from '../services/library.service.js';
import * as romLibrary from '../services/rom-library.service.js';
import { input } from '../services/input.service.js';
import { readFile, storagePath } from '../services/storage.js';
import { guardFileDrops } from '../services/drop-guard.js';

guardFileDrops();

const slug = document.body.dataset.slug;
const entry = gameBySlug(slug);
const params = new URLSearchParams(location.search);
const view = $reactive({ mode: 'loading', status: null, error: null, notice: null, title: null });

const cameFromLauncher = () => {
  try {
    return document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
};

let handle = null;
const exit = async () => {
  await handle?.unmount?.().catch(() => {});
  handle = null;
  if (entry?.system && params.get('game') && !cameFromLauncher()) location.assign(`/${slug}/`);
  else if (cameFromLauncher() && history.length > 1) history.back();
  else location.assign(`/?focus=${encodeURIComponent(slug)}`);
};

const fail = (message) => {
  view.error = message;
  view.mode = 'error';
};

/** Mount the engine's app (or the generic one) with everything resolved. */
async function launch({ engineId, title, assets, namespace, art = null, init = {}, options = {} }) {
  const engine = engines[engineId];
  if (!engine) return fail(`El motor "${engineId}" no está disponible en este lanzador.`);
  view.title = title;
  view.status = 'Arrancando el motor…';
  const base = `/engines/${engineId}/`;
  const host = {
    game: { slug, title, accent: entry.accent, art: art ?? entry.cover ?? entry.tileArt ?? entry.art },
    storage: { namespace },
    assets,
    // Engine options a catalog entry sets for its apps (Neo Geo: `{ neogeo: 'aes' }`).
    options,
    input,
    exit,
  };
  const target = document.querySelector('#app');
  try {
    let app = genericApp;
    if (engine.app) app = await import(/* @vite-ignore */ `${base}${engine.app}`);
    const mountApp = () =>
      app === genericApp
        ? genericApp.mount(target, host, { sdkUrl: `${base}${engine.entry}`, engineId, init, options })
        : app.mount(target, host);
    view.mode = 'playing';
    handle = await mountApp();
    // A notice (unknown version, patches not yet) stays a few seconds over the game.
    if (view.notice) setTimeout(() => { view.notice = null }, 6000);
  } catch (error) {
    console.error('[route]', error);
    fail(error.message ?? String(error));
  }
}

/** /sonic1/: the game's installed files, read back from the engine's own folder. */
async function startGame() {
  if (entry.status !== 'ready') return fail(`${entry.title} todavía no se puede jugar.`);
  await refresh(slug);
  if (entry.install && !library.installed[slug]) {
    view.mode = 'install';
    return;
  }
  const path = storagePath(entry.engine, slug);
  const assets = Object.fromEntries(
    Object.entries(entry.install ?? {}).map(([key, spec]) => [
      key,
      async () => {
        const file = await readFile(path, spec.file);
        if (!file) throw new Error(`Falta ${spec.file} en ${path}/`);
        return new Uint8Array(await file.arrayBuffer());
      },
    ]),
  );
  await launch({ engineId: entry.engine, title: entry.title, assets, namespace: slug, init: { config: entry.config ?? {} }, options: entry.options ?? {} });
}

/** /megadrive/?game=…&version=…&patch=…: a ROM from the system's library. */
async function startRom(gameId) {
  const found = await romLibrary.findGame(entry.system, gameId);
  if (!found) {
    view.notice = `"${gameId}" no está en tu biblioteca de ${entry.title}.`;
    return showLibrary();
  }
  const { index, game } = found;
  const wantedMod = (params.get('patch') ?? '').toLowerCase();
  const mod = wantedMod ? game.mods.find((m) => m.sha1.startsWith(wantedMod)) : null;
  if (wantedMod && !mod) {
    // Never fall back to the unpatched game silently: say so and show the library.
    view.notice = 'Ese mod no está en tu biblioteca.';
    return showLibrary();
  }
  const wanted = (params.get('version') ?? '').toLowerCase();
  let version = (wanted && game.versions.find((v) => v.sha1.startsWith(wanted))) || null;
  if (!version) {
    version = mod ? romLibrary.versionForMod(mod, game) : game.versions[0];
    if (wanted) view.notice = 'Esa versión no está en la biblioteca: se carga la más reciente.';
  }
  let rom;
  try {
    // Patched up front: a mod that does not fit fails here, with its own reason.
    rom = await romLibrary.readRomWithMod(entry.system, version, mod);
  } catch (error) {
    return fail(mod ? `No se pudo aplicar «${mod.name}»: ${error.message}` : error.message);
  }
  // A system with a BIOS (Neo Geo): the engine gets it next to the game, or the player
  // is told what is missing instead of a black screen.
  let bios = null;
  if (entry.bios) {
    bios = await romLibrary.readBios(entry.system);
    if (!bios) return fail(`Falta la BIOS ${entry.bios.file}: añádela a la biblioteca de ${entry.title}.`);
  }
  // The box from ROM Manager's catalogue, when the game is in it: the engine app's boot screen.
  const box = await romLibrary.coverOf(entry.system, game, localStorage.getItem('roms-region') || 'EU').catch(() => null);
  await launch({
    art: box?.url ?? null,
    engineId: romLibrary.coreFor(index, game, entry.engine),
    title: mod ? `${game.title} · ${mod.name}` : game.title,
    options: entry.options ?? {},
    assets: { rom: () => rom, ...(bios ? { bios: () => bios } : {}) },
    // A mod is another game as far as saves go: its own folder.
    namespace: mod ? `${gameId}+${mod.sha1.slice(0, 8)}` : gameId,
  });
}

async function showLibrary() {
  await romLibrary.load(entry.system);
  view.mode = 'library';
}

// A ROM chosen in the library: same page, new query — a navigation the view transition covers.
const openRom = ({ detail }) => {
  const q = new URLSearchParams({ game: detail.gameId, version: detail.sha1.slice(0, 8) });
  if (detail.patch) q.set('patch', detail.patch.slice(0, 8));
  location.assign(`/${slug}/?${q}`);
};

const onInstalled = () => startGame();

Route.mount('#route', {
  view,
  entry: entry ?? { slug, title: slug },
  roms: romLibrary.roms,
  romLibrary,
  input,
  InstallDialog,
  RomDrawer,
  install,
  onInstalled,
  openRom,
  exit,
});

if (!entry) fail(`No hay nada en "/${slug}/".`);
else if (entry.kind === 'emulator') {
  const gameId = params.get('game');
  if (!gameId) showLibrary();
  else startRom(gameId);
} else startGame();
