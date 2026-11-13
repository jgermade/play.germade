// The launcher's generic engine app: what runs a game while its engine does not ship
// an app of its own (EngineApp in @wasm-gaming/engine-specs, rules in its UX.md).
//
// It boots the engine's SDK into a full-screen stage and owns one menu, the pause
// menu: Select+Start or Escape opens it (in game only that combo reaches us), the
// engine is paused and the input switches to the menu; Continue / Restart / Exit.

import { $reactive } from 'jq79';
import PauseMenu from './PauseMenu.html';

const OWNER = 'app';

export async function mount(target, host, { sdkUrl, engineId, init = {}, options = {} } = {}) {
  const stage = document.createElement('div');
  stage.className = 'app-stage';
  const overlay = document.createElement('div');
  target.append(stage, overlay);

  const state = { open: false, focus: 0, error: null, items: [] };
  let play = null;
  let leaving = false;

  const menu = PauseMenu;
  const view = { state: null };

  const render = () => menu.mount(overlay, { state: view.state, title: host.game.title, choose });
  const close = () => {
    view.state.open = false;
    play?.resume?.(OWNER);
    host.input.suspend();
    stage.querySelector('canvas')?.focus();
  };
  const open = (error = null) => {
    view.state.error = error;
    view.state.items = error ? ['Volver'] : ['Continuar', 'Reiniciar', 'Volver'];
    view.state.focus = 0;
    view.state.open = true;
    play?.pause?.(OWNER); // before start() resolves there is nothing to pause yet
    host.input.resume();
  };
  const exit = async () => {
    if (leaving) return;
    leaving = true;
    try {
      await play?.destroy?.();
    } catch (e) {
      console.warn('[app] destroy failed', e);
    }
    host.exit();
  };
  async function choose(item) {
    if (item === 'Continuar') close();
    else if (item === 'Reiniciar') {
      close();
      try {
        await play?.restart?.();
      } catch (e) {
        open(e.message ?? String(e));
      }
    } else if (item === 'Volver') await exit();
  }

  view.state = $reactive(state);
  render();

  const off = host.input.on((action) => {
    const s = view.state;
    if (!s.open) {
      if (action === 'menu') open();
      return;
    }
    if (action === 'up') s.focus = (s.focus + s.items.length - 1) % s.items.length;
    else if (action === 'down') s.focus = (s.focus + 1) % s.items.length;
    else if (action === 'accept') choose(s.items[s.focus]);
    else if ((action === 'back' || action === 'menu') && !s.error) close();
  });

  try {
    const { default: EngineSDK } = await import(/* @vite-ignore */ sdkUrl);
    if (EngineSDK?.id !== engineId) throw new Error(`El SDK en ${sdkUrl} no es "${engineId}"`);
    // The game has the controls from the moment it boots (start() can take seconds):
    // only Select+Start / Escape still reach the menu.
    host.input.suspend();
    play = await new EngineSDK(init)
      .assets(host.assets)
      .storage(host.storage)
      .on('error', ({ detail }) => open(detail?.message ?? String(detail)))
      .on('exit', () => exit())
      .mount(stage)
      .start(options);
    stage.querySelector('canvas')?.focus();
  } catch (error) {
    console.error('[app]', error);
    open(error.message ?? String(error));
  }

  return {
    async unmount() {
      off();
      try {
        await play?.destroy?.();
      } catch {
        /* gone */
      }
      stage.remove();
      overlay.remove();
    },
  };
}
