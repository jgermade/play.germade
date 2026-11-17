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

import Route from '../views/Route.html';
import InstallDialog from '../components/InstallDialog.html';
import RomDrawer from '../views/RomDrawer.html';
import * as genericApp from '../views/generic-app.js';

import { gameBySlug } from '../lib/catalog.js';
import { playableCore, resolveCores } from '../helpers/cores.js';
import engines from '../lib/engines.json';
import { library, refresh, install } from '../lib/library.service.js';
import * as romLibrary from '../lib/rom-library.service.js';
import { input } from '../lib/input.service.js';
import { readFile, storagePath } from '../lib/storage.js';
import { guardFileDrops } from '../lib/drop-guard.js';
import { attachTouchPad } from '../lib/touch.service.js';
import { currentLocale, i18n, otherLanguage, plural, setLanguage, t, tx } from '../lib/i18n.service.js';

// The language helpers, one object for the views and the components they pass it to.
const l10n = { i18n, t, tx, plural, setLanguage, otherLanguage };

guardFileDrops();

const slug = document.body.dataset.slug;
const found = gameBySlug(slug);
// The cores this browser can run (jgenesis needs WebGPU): the drawer shows the others disabled.
// `navigator.gpu` alone is not enough (it is there with no adapter behind it): ask for one,
// only on a page with a core that needs it, and give up after a second.
const hasWebGpu = async () => {
  if (!('gpu' in navigator)) return false;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1000));
  return !!(await Promise.race([navigator.gpu.requestAdapter().catch(() => null), timeout]));
};
const needsWebGpu = found?.cores?.some((core) => core.needs?.includes('webgpu'));
const entry = found?.cores ? { ...found, cores: resolveCores(found.cores, { webgpu: needsWebGpu && (await hasWebGpu()) }) } : found;
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
let detachTouchPad = () => {};
const exit = async () => {
  await handle?.unmount?.().catch(() => {});
  handle = null;
  detachTouchPad();
  if (entry?.system && params.get('game') && !cameFromLauncher()) location.assign(`/${slug}/`);
  else if (cameFromLauncher() && history.length > 1) history.back();
  else location.assign(`/?focus=${encodeURIComponent(slug)}`);
};

const fail = (message) => {
  view.error = message;
  view.mode = 'error';
};

/** Mount the engine's app (or the generic one) with everything resolved. */
async function launch({ engineId, title, assets, namespace, art = null, init = {}, options = {}, touch = entry.system }) {
  const engine = engines[engineId];
  if (!engine) return fail(t('route.noEngine', { engine: engineId }));
  view.title = title;
  view.status = t('route.booting');
  const base = `/engines/${engineId}/`;
  const host = {
    game: { slug, title, accent: entry.accent, art: art ?? entry.cover ?? entry.tileArt ?? entry.art },
    storage: { namespace },
    assets,
    // Engine options a catalog entry sets for its apps (Neo Geo: `{ neogeo: 'aes' }`).
    options,
    // The launcher's language: the app speaks it (engine-specs EngineAppHost.locale).
    locale: currentLocale(),
    input,
    exit,
  };
  const target = document.querySelector('#app');
  try {
    // Emulators on a phone or a tablet: the on-screen pad, exposed before the engine starts.
    if (entry.kind === 'emulator') detachTouchPad = attachTouchPad({ system: touch, target, input });
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
    detachTouchPad();
    fail(error.message ?? String(error));
  }
}

/** /sonic1/: the game's installed files, read back from the engine's own folder. */
async function startGame() {
  if (entry.status !== 'ready') return fail(t('route.notReady', { title: entry.title }));
  await refresh(slug);
  if (entry.install && !library.installed[slug]) {
    view.mode = 'install';
    return;
  }
  const path = storagePath(entry.engine, slug);
  // An optional file the player did not give (Sonic 3 A.I.R.'s soundtrack) is left out.
  const given = [];
  for (const [key, spec] of Object.entries(entry.install ?? {})) {
    if (!spec.optional || (await readFile(path, spec.file))) given.push([key, spec]);
  }
  const assets = Object.fromEntries(
    given.map(([key, spec]) => [
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
/** Why a mod did not apply, by the code rom-manager's patcher gives. */
const PATCH_REASONS = new Set(['not-a-patch', 'truncated', 'damaged', 'wrong-source', 'wrong-result', 'out-of-bounds']);

async function startRom(gameId) {
  const found = await romLibrary.findGame(entry.system, gameId, params.get('system'));
  if (!found) {
    view.notice = t('route.notInLibrary', { game: gameId, title: entry.title });
    return showLibrary();
  }
  const { index, game } = found;
  const wantedMod = (params.get('patch') ?? '').toLowerCase();
  const mod = wantedMod ? game.mods.find((m) => m.sha1.startsWith(wantedMod)) : null;
  if (wantedMod && !mod) {
    // Never fall back to the unpatched game silently: say so and show the library.
    view.notice = t('route.modNotInLibrary');
    return showLibrary();
  }
  const wanted = (params.get('version') ?? '').toLowerCase();
  let version = (wanted && game.versions.find((v) => v.key.startsWith(wanted))) || null;
  if (!version) {
    version = mod ? romLibrary.versionForMod(mod, game) : game.versions[0];
    if (wanted) view.notice = t('route.versionNotInLibrary');
  }
  let rom;
  try {
    // Patched up front: a mod that does not fit fails here, with its own reason.
    rom = await romLibrary.readRomWithMod(entry.system, version, mod);
  } catch (error) {
    return fail(mod ? t('route.modFailed', { mod: mod.name, reason: PATCH_REASONS.has(error.code) ? t(`patch.${error.code}`) : error.message }) : error.message);
  }
  // A system with a BIOS (Neo Geo): the engine gets it next to the game, or the player
  // is told what is missing instead of a black screen.
  let bios = null;
  if (entry.bios) {
    bios = await romLibrary.readBios(entry.system);
    if (!bios) return fail(t('route.noBios', { file: entry.bios.file, title: entry.title }));
  }
  // The box from ROM Manager's catalogue, when the game is in it: the engine app's boot screen.
  const box = await romLibrary.coverOf(entry.system, game, localStorage.getItem('roms-region') || 'EU').catch(() => null);
  await launch({
    art: box?.url ?? null,
    // A core chosen in another browser that this one cannot run plays on the default.
    engineId: playableCore(entry.cores ?? [], romLibrary.coreFor(index, game, entry.engine), entry.engine),
    title: mod ? `${game.title} · ${mod.name}` : game.title,
    options: entry.options ?? {},
    assets: { rom: () => rom, ...(bios ? { bios: () => bios } : {}) },
    // A mod is another game as far as saves go: its own folder.
    namespace: mod ? `${gameId}+${mod.sha1.slice(0, 8)}` : gameId,
    // A Game Boy cart in the GBA library gets the Game Boy's pad.
    touch: romLibrary.touchSystemFor(entry.system, version),
  });
}

async function showLibrary() {
  await romLibrary.load(entry.system);
  view.mode = 'library';
}

// A ROM chosen in the library: same page, new query — a navigation the view transition covers.
const openRom = ({ detail }) => {
  location.assign(`/${slug}/?${romLibrary.playQuery(detail)}`);
};

const onInstalled = () => startGame();

Route.mount('#route', {
  l10n,
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
