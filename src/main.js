import '@fontsource-variable/inter';
import '@fontsource-variable/unbounded';
import { registerSW } from 'virtual:pwa-register';
import { $reactive } from 'jq79';

import App from './views/App.html';
import Hero from './components/Hero.html';
import Notice from './components/Notice.html';
import RomDrawer from './views/RomDrawer.html';

import { rows } from './lib/catalog.js';
import { library, refresh, uninstall } from './lib/library.service.js';
import { onAction } from './lib/input.service.js';
import * as romLibrary from './lib/rom-library.service.js';
import { guardFileDrops } from './lib/drop-guard.js';
import { i18n, otherLanguage, plural, setLanguage, t, tx } from './lib/i18n.service.js';

guardFileDrops();

// What the page shows about the app itself: a new version waiting, isolation.
const shell = $reactive({ update: null, isolated: globalThis.crossOriginIsolated === true });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const updateSW = registerSW({
    onNeedRefresh() {
      shell.update = () => updateSW(true);
    },
  });

  // On a static host the first visit is served before the worker exists, so it has
  // no isolation headers. Once the worker controls the page, one reload gets them.
  navigator.serviceWorker.ready.then(() => {
    if (!globalThis.crossOriginIsolated && !sessionStorage.getItem('coi-reloaded')) {
      sessionStorage.setItem('coi-reloaded', '1');
      location.reload();
    }
  });
}

// The language helpers, one object for the views and the components they pass it to.
const l10n = { i18n, t, tx, plural, setLanguage, otherLanguage };

App.mount('#app', {
  rows: rows(),
  l10n,
  library,
  shell,
  refresh,
  uninstall,
  onAction,
  Hero,
  Notice,
  RomDrawer,
  roms: romLibrary.roms,
  romLibrary,
});
