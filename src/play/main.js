// The player: one page for every engine, loaded by the launcher in an iframe.
//
// It knows nothing engine-specific. It reads the catalog entry, imports the engine's
// self-contained SDK from /engines/<id>/, points it at the game's own folder
// (storage namespace = slug → OPFS <engine>/<slug>/), hands over the installed files
// as thunks, and drives it through the shared contract. The iframe is what makes
// "back to the catalog" safe for any engine: dropping it frees everything,
// including engines that cannot restart in process.
//
// Two kinds of launch:
//   ?game=<slug>                          a catalog game (its files installed in OPFS)
//   ?system=<id>&game=<gameId>&rom=<sha1> a ROM from an emulator's library; the core is
//                                         the game's choice → the console's → the default

import { $reactive } from 'jq79';
import Menu from './Menu.html';
import { GAMES, gameBySlug } from '../data/catalog.js';
import engines from '../data/engines.json';
import { readFile, storagePath } from '../services/storage.js';
import { coreFor, findGame, readRom } from '../services/rom-library.service.js';

const params = new URLSearchParams(location.search);
const slug = params.get('game');
const system = params.get('system');
const game = system ? null : gameBySlug(slug);
const state = $reactive({ status: 'loading', error: null, menu: false, title: game?.title ?? slug });

/**
 * What to boot: engine id, the SDK's init, assets as thunks, and the storage namespace.
 * The player stays engine-agnostic: everything engine-specific is data from here.
 */
async function resolveLaunch() {
  if (system) {
    const entry = GAMES.find((g) => g.system === system);
    if (!entry) throw new Error(`No hay ningún sistema "${system}" en el catálogo`);
    const found = await findGame(system, slug);
    if (!found) throw new Error(`"${slug}" no está en la biblioteca de ${entry.title}`);
    const { index, game: libraryGame } = found;
    const version = libraryGame.versions.find((v) => v.sha1 === params.get('rom')) ?? libraryGame.versions[0];
    state.title = libraryGame.title;
    return {
      engineId: coreFor(index, libraryGame, entry.engine),
      init: {},
      assets: { rom: () => readRom(system, version) },
      namespace: slug,
      options: {},
    };
  }

  if (!game) throw new Error(`No hay ningún juego "${slug}" en el catálogo`);
  if (game.status !== 'ready') throw new Error(`${game.title} todavía no se puede jugar`);
  // Installed files, read back from the engine's own folder when the engine asks.
  const path = storagePath(game.engine, game.slug);
  const assets = Object.fromEntries(
    Object.entries(game.install ?? {}).map(([key, spec]) => [
      key,
      async () => {
        const file = await readFile(path, spec.file);
        if (!file) throw new Error(`Falta ${spec.file} en ${path}/ — instala el juego desde el catálogo`);
        return new Uint8Array(await file.arrayBuffer());
      },
    ]),
  );
  return { engineId: game.engine, init: { config: game.config ?? {} }, assets, namespace: game.slug, options: game.options ?? {} };
}
const OWNER = 'launcher';
let play = null;

const fail = (error) => {
  console.error('[player]', error);
  state.status = 'error';
  state.error = error?.message ?? String(error);
  state.menu = true;
};

const openMenu = () => {
  if (state.menu) return;
  play?.pause?.(OWNER);
  state.menu = true;
};

const resume = () => {
  state.menu = false;
  play?.resume?.(OWNER);
  document.querySelector('#stage canvas')?.focus();
};

const restart = async () => {
  state.menu = false;
  try {
    play?.resume?.(OWNER);
    await play?.restart?.();
  } catch (e) {
    fail(e);
  }
};

let exiting = false;
const exit = async () => {
  if (exiting) return; // destroy() itself emits 'exit'
  exiting = true;
  state.status = 'closing';
  try {
    await play?.destroy?.();
  } catch (e) {
    console.warn('[player] destroy failed', e);
  }
  parent.postMessage({ type: 'launcher:exit', slug }, location.origin);
};

Menu.mount('#menu', { state, resume, restart, exit });

// Escape opens the menu. Capture phase, and only Escape: swallowing anything else
// here would take the keyboard away from the engine (SDL listens on window).
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (state.menu && state.status === 'running') resume();
    else openMenu();
  },
  true,
);

// Gamepad: Select + Start together is Escape.
let comboHeld = false;
const pollPads = () => {
  const pads = navigator.getGamepads?.() ?? [];
  const combo = pads.some((pad) => pad?.buttons[8]?.pressed && pad?.buttons[9]?.pressed);
  if (combo && !comboHeld) (state.menu ? resume : openMenu)();
  comboHeld = combo;
  requestAnimationFrame(pollPads);
};
requestAnimationFrame(pollPads);

// Escape leaves fullscreen before any page sees it; where the Keyboard Lock API
// exists, keep it for the menu while fullscreen.
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) navigator.keyboard?.lock?.(['Escape']).catch(() => {});
  else navigator.keyboard?.unlock?.();
});

try {
  const launch = await resolveLaunch();
  const engine = engines[launch.engineId];
  if (!engine) throw new Error(`El motor "${launch.engineId}" no está disponible en este lanzador`);

  const base = `${import.meta.env.BASE_URL}engines/${launch.engineId}/`;
  const { default: EngineSDK } = await import(/* @vite-ignore */ `${base}${engine.entry}`);
  if (EngineSDK?.id !== launch.engineId) throw new Error(`El SDK en ${base} no es "${launch.engineId}"`);

  play = await new EngineSDK(launch.init)
    .assets(launch.assets)
    .storage({ namespace: launch.namespace })
    .on('error', ({ detail }) => fail(detail))
    .on('exit', () => exit())
    .mount(document.querySelector('#stage'))
    .start(launch.options);

  state.status = 'running';
  document.querySelector('#stage canvas')?.focus();
} catch (error) {
  fail(error);
}
