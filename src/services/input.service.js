// One input stream for the launcher UI: keyboard and gamepads both become
// 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'more' (Y / V: secondary menu). Views subscribe with
// onAction(); while a game is running the launcher stops listening (`paused`), so
// the game gets every key and button.

const KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'accept',
  ' ': 'accept',
  Escape: 'back',
  Backspace: 'back',
  v: 'more',
  V: 'more',
  ContextMenu: 'more',
};

// Standard mapping: 0 = A/Cross, 1 = B/Circle, 12-15 = d-pad.
const BUTTONS = { 0: 'accept', 1: 'back', 3: 'more', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const AXIS_THRESHOLD = 0.6;
const REPEAT_DELAY = 380;
const REPEAT_RATE = 120;

const listeners = new Set();
let paused = false;

export const onAction = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const setPaused = (value) => {
  paused = value;
};

const fire = (action, source) => {
  if (paused) return false;
  for (const fn of listeners) fn(action, source);
  return true;
};

window.addEventListener('keydown', (event) => {
  const action = KEYS[event.key];
  if (!action || paused) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  event.preventDefault();
  fire(action, 'keyboard');
});

// Gamepads: poll, with key-like repeat for held directions.
const held = new Map(); // action → { since, last }

function pressedActions(pad) {
  const actions = new Set();
  pad.buttons.forEach((button, index) => {
    if (button.pressed && BUTTONS[index]) actions.add(BUTTONS[index]);
  });
  const [x = 0, y = 0] = pad.axes;
  if (x < -AXIS_THRESHOLD) actions.add('left');
  if (x > AXIS_THRESHOLD) actions.add('right');
  if (y < -AXIS_THRESHOLD) actions.add('up');
  if (y > AXIS_THRESHOLD) actions.add('down');
  return actions;
}

function poll(now) {
  const pads = navigator.getGamepads?.() ?? [];
  const active = new Set();
  for (const pad of pads) if (pad) for (const action of pressedActions(pad)) active.add(action);

  for (const action of active) {
    const state = held.get(action);
    if (!state) {
      held.set(action, { since: now, last: now });
      fire(action, 'gamepad');
    } else if (
      ['up', 'down', 'left', 'right'].includes(action) &&
      now - state.since > REPEAT_DELAY &&
      now - state.last > REPEAT_RATE
    ) {
      state.last = now;
      fire(action, 'gamepad');
    }
  }
  for (const action of [...held.keys()]) if (!active.has(action)) held.delete(action);
  requestAnimationFrame(poll);
}

window.addEventListener('gamepadconnected', () => {
  if (held.size === 0) requestAnimationFrame(poll);
}, { once: true });
