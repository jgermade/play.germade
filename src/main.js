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

App.mount('#app', {
  rows: rows(),
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
