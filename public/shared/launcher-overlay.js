// Shared overlay injected into every game's static build.
// Provides: a Cmd+Enter / Alt+Enter shortcut to toggle native browser
// fullscreen (always), plus a way back to the launcher — either a
// persistent corner button (default) or an Escape-triggered minimal menu.
// Engine-agnostic on purpose (browser-level APIs only), so it can be reused
// across Sonic 1/2/3 and Celeste without depending on any engine internals.
//
// Config flags a game's shell can set *before* this script runs:
// - `window.__hideLauncherReturnButton = true` — for games with their own
//   richer in-game "Return to Launcher" option already (e.g. Sonic 1/2's
//   own Dev Menu). Skips the button entirely; that game owns Escape itself.
// - `window.__launcherReturnViaEscMenu = true` — for games with no such
//   menu of their own (e.g. Sonic 3): skip the persistent button and
//   instead show a minimal Escape-triggered overlay with just a
//   "Return to Launcher" entry. Gamepad Select+Start becomes an alias for
//   Escape (toggles this mini-menu) instead of the long-press-to-return.
(function () {
  'use strict';

  var HIGHLIGHT = '#66fcf1';
  var escMenuMode = !!window.__launcherReturnViaEscMenu;

  var style = document.createElement('style');
  style.textContent =
    '#launcher-return-btn {' +
    '  position: fixed; top: 14px; left: 14px; z-index: 999999;' +
    '  width: 40px; height: 40px; border-radius: 50%;' +
    '  background: rgba(11, 12, 16, 0.75); color: ' + HIGHLIGHT + ';' +
    '  border: 2px solid ' + HIGHLIGHT + ';' +
    '  display: flex; align-items: center; justify-content: center;' +
    '  font-size: 18px; cursor: pointer; opacity: 0.35;' +
    '  transition: opacity 0.2s; user-select: none;' +
    '  -webkit-tap-highlight-color: transparent;' +
    '}' +
    '#launcher-return-btn:hover, #launcher-return-btn:focus-visible, #launcher-return-btn.holding {' +
    '  opacity: 1;' +
    '}' +
    '#launcher-return-progress {' +
    '  position: fixed; top: 14px; left: 14px; z-index: 999998;' +
    '  width: 40px; height: 40px; border-radius: 50%; pointer-events: none;' +
    '  background: conic-gradient(' + HIGHLIGHT + ' calc(var(--pct, 0) * 1%), transparent 0);' +
    '  opacity: 0; transition: opacity 0.1s;' +
    '}' +
    '#launcher-return-progress.active { opacity: 0.9; }' +
    '#launcher-esc-menu {' +
    '  display: none; position: fixed; inset: 0; z-index: 999999;' +
    '  align-items: center; justify-content: center;' +
    '  background: rgba(11, 12, 16, 0.75);' +
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
    '}' +
    '#launcher-esc-menu-panel {' +
    '  background: #0b0c10; border: 2px solid ' + HIGHLIGHT + '; border-radius: 10px;' +
    '  padding: 16px 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);' +
    '}' +
    '#launcher-esc-menu-item {' +
    '  color: ' + HIGHLIGHT + '; background: rgba(102, 252, 241, 0.15);' +
    '  padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 1rem;' +
    '}';
  document.head.appendChild(style);

  var btn = document.createElement('div');
  btn.id = 'launcher-return-btn';
  btn.title = 'Return to launcher';
  btn.textContent = '🏠';
  btn.addEventListener('click', function () {
    window.location.href = '/';
  });

  var progressRing = document.createElement('div');
  progressRing.id = 'launcher-return-progress';

  var escMenu, escMenuItem;
  if (escMenuMode) {
    escMenu = document.createElement('div');
    escMenu.id = 'launcher-esc-menu';
    var panel = document.createElement('div');
    panel.id = 'launcher-esc-menu-panel';
    escMenuItem = document.createElement('div');
    escMenuItem.id = 'launcher-esc-menu-item';
    escMenuItem.textContent = '⬅ Return to Launcher (Enter)';
    escMenuItem.addEventListener('click', function () {
      window.location.href = '/';
    });
    panel.appendChild(escMenuItem);
    escMenu.appendChild(panel);
  }

  function mount() {
    if (escMenuMode) {
      document.body.appendChild(escMenu);
      return;
    }
    if (window.__hideLauncherReturnButton) return;
    document.body.appendChild(btn);
    document.body.appendChild(progressRing);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  var escMenuOpen = false;
  function toggleEscMenu() {
    escMenuOpen = !escMenuOpen;
    escMenu.style.display = escMenuOpen ? 'flex' : 'none';
  }
  if (escMenuMode) {
    window.isDevMenuOpen = function () { return escMenuOpen; };

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleEscMenu();
        return;
      }
      if (!escMenuOpen) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Enter') window.location.href = '/';
    }, true);
  }

  // Gamepad long-press: hold Select+Start (buttons 8+9) together for ~1.2s.
  // In `escMenuMode`, the combo instead aliases Escape (toggles the mini-menu).
  var HOLD_MS = 1200;
  var holdStart = null;
  var comboWasHeld = false;

  function pollGamepadReturn() {
    // Where a per-game Dev Menu exists (e.g. Sonic 1/2), Select+Start is
    // already claimed there as an alias for Escape — don't also fire this
    // long-press while that menu is open/handling the combo.
    if (!escMenuMode && window.isDevMenuOpen && window.isDevMenuOpen()) {
      holdStart = null;
      progressRing.classList.remove('active');
      progressRing.style.setProperty('--pct', 0);
      btn.classList.remove('holding');
      requestAnimationFrame(pollGamepadReturn);
      return;
    }

    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var comboHeld = false;
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad) continue;
      var select = pad.buttons[8] && pad.buttons[8].pressed;
      var start = pad.buttons[9] && pad.buttons[9].pressed;
      if (select && start) {
        comboHeld = true;
        break;
      }
    }

    if (escMenuMode) {
      if (comboHeld && !comboWasHeld) toggleEscMenu();
      comboWasHeld = comboHeld;
      requestAnimationFrame(pollGamepadReturn);
      return;
    }

    if (comboHeld) {
      if (holdStart === null) holdStart = performance.now();
      var elapsed = performance.now() - holdStart;
      var pct = Math.min(100, (elapsed / HOLD_MS) * 100);
      progressRing.style.setProperty('--pct', pct.toFixed(0));
      progressRing.classList.add('active');
      btn.classList.add('holding');
      if (elapsed >= HOLD_MS) {
        window.location.href = '/';
        return;
      }
    } else {
      holdStart = null;
      progressRing.classList.remove('active');
      progressRing.style.setProperty('--pct', 0);
      btn.classList.remove('holding');
    }

    requestAnimationFrame(pollGamepadReturn);
  }
  requestAnimationFrame(pollGamepadReturn);

  // Fullscreen toggle: Cmd+Enter (macOS) / Alt+Enter (Windows/Linux).
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (!(e.metaKey || e.altKey)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  }, true);
})();
