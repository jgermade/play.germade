// /roms/ — the ROM manager: every system's library, its versions and its mods.
// Same origin as the launcher, so the same OPFS `library/<system>/` (see
// services/rom-library.service.js); same input scheme (engine-specs UX.md).


import Manager from './Manager.html';
import { GAMES } from '../data/catalog.js';
import * as romLibrary from '../services/rom-library.service.js';
import { input } from '../services/input.service.js';
import { requestPersistence } from '../services/storage.js';

const params = new URLSearchParams(location.search);

// The systems the launcher knows, in catalog order: those with a ROM library are
// manageable now, the rest are shown as coming.
const supported = new Set(romLibrary.systems().map((s) => s.id));
const systems = GAMES.filter((g) => g.kind === 'emulator').map((g) => ({
  id: g.system ?? g.slug,
  slug: g.slug,
  title: g.title,
  art: g.tileArt ?? g.art,
  accent: g.accent,
  accept: g.accept ?? [],
  boxart: g.boxart ?? '3 / 4',
  cores: g.cores ?? [{ id: g.engine, label: g.engine }],
  engine: g.engine,
  ready: supported.has(g.system) && g.status === 'ready',
}));

const cameFromLauncher = () => {
  try {
    return document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
};

Manager.mount('#roms', {
  systems,
  initialSystem: params.get('system') ?? systems.find((s) => s.ready)?.id,
  initialGame: params.get('game'),
  roms: romLibrary.roms,
  library: romLibrary,
  input,
  persistent: navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(false),
  requestPersistence,
  exit: () => (cameFromLauncher() && history.length > 1 ? history.back() : location.assign('/')),
});
