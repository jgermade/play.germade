// The launcher's input: the shared usability scheme from @wasm-gaming/engine-specs
// (UX.md there), so the home, the libraries, the generic app and every engine app
// react to the same buttons the same way.

import { createInput } from '@wasm-gaming/engine-specs';

export const input = createInput();

/** Subscribe to actions ('up' | 'down' | … | 'accept' | 'back' | 'menu' | 'more' | 'prev' | 'next'). */
export const onAction = (fn) => input.on(fn);

/** The game has the controls (only the menu combo gets through) — or the menus have them again. */
export const setPaused = (value) => (value ? input.suspend() : input.resume());
