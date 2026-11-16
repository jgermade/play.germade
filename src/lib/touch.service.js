// The on-screen gamepad for phones and tablets (engine-specs `createTouchPad()`), on the
// emulator routes: one layout per system, exposed to the engine as a standard gamepad,
// shown while the game has the controls and hidden in the engine app's menus.
//
// Read through the package namespace and feature-detected, so the launcher still builds
// against an engine-specs without it (0.4.x): no pad, nothing else changes.

import * as specs from '@wasm-gaming/engine-specs';

const supported = () =>
  typeof specs.createTouchPad === 'function' &&
  typeof specs.exposeAsGamepad === 'function' &&
  typeof specs.connectTouchPad === 'function';

/**
 * A touch-first device: a phone or a tablet. Only there is the pad exposed — on a desktop
 * a listed pad would take player 1 from the keyboard in FBNeo, which binds each input to
 * one device and looks for pads when it starts.
 */
export const touchFirst = () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

/** The layout for a catalog system, or null. */
export const touchLayoutFor = (system) => (supported() && system ? specs.TOUCH_LAYOUTS?.[system] ?? null : null);

const place = (target, area, full) => {
  const box = full ? { left: '0px', top: '0px', width: '100%', height: '100%' } : {
    left: `${area.x}px`,
    top: `${area.y}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  };
  Object.assign(target.style, { right: 'auto', bottom: 'auto', ...box });
};

/**
 * Put the pad up for `system` and fit `target` (the route's `#app`) into what it leaves.
 * Call it **before** the engine starts: SDL and FBNeo look for pads when they start.
 * Returns `detach()`; a no-op when there is nothing to attach.
 */
export function attachTouchPad({ system, target, input }) {
  const layout = touchLayoutFor(system);
  if (!layout || !touchFirst()) return () => {};
  const pad = specs.createTouchPad(document.body, { layout });
  const release = specs.exposeAsGamepad(pad);
  const disconnect = specs.connectTouchPad(pad, input);
  const offLayout = pad.onLayout((area, placement) => place(target, area, !placement));
  place(target, pad.gameArea, !pad.placement);
  document.documentElement.classList.add('has-touch-pad');
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    offLayout();
    disconnect();
    release();
    pad.destroy();
    for (const side of ['left', 'top', 'width', 'height', 'right', 'bottom']) target.style.removeProperty(side);
    document.documentElement.classList.remove('has-touch-pad');
  };
}
