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
async function launch({ engineId, title, assets, namespace, init = {}, options = {} }) {
  const engine = engines[engineId];
  if (!engine) return fail(`El motor "${engineId}" no está disponible en este lanzador.`);
  view.title = title;
  view.status = 'Arrancando el motor…';
  const base = `/engines/${engineId}/`;
  const host = {
    game: { slug, title, accent: entry.accent, art: entry.cover ?? entry.tileArt ?? entry.art },
    storage: { namespace },
    assets,
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
  const wanted = (params.get('version') ?? '').toLowerCase();
  const version = (wanted && game.versions.find((v) => v.sha1.startsWith(wanted))) || game.versions[0];
  if (wanted && !version.sha1.startsWith(wanted)) view.notice = 'Esa versión no está en la biblioteca: se carga la más reciente.';
  if (params.get('patch')) view.notice = 'Los parches de ROM hacking llegarán pronto: se carga la ROM sin parchear.';
  await launch({
    engineId: romLibrary.coreFor(index, game, entry.engine),
    title: game.title,
    assets: { rom: () => romLibrary.readRom(entry.system, version) },
    namespace: gameId,
  });
}

async function showLibrary() {
  await romLibrary.load(entry.system);
  view.mode = 'library';
}

// A ROM chosen in the library: same page, new query — a navigation the view transition covers.
const openRom = ({ detail }) => {
  const q = new URLSearchParams({ game: detail.gameId, version: detail.sha1.slice(0, 8) });
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
