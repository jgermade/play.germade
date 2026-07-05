// Shared overlay injected into every game's static build.
// Provides: a corner button + gamepad long-press to return to the launcher,
// and a Cmd+Enter / Alt+Enter shortcut to toggle native browser fullscreen.
// Engine-agnostic on purpose (browser-level APIs only), so it can be reused
// across Sonic 1/2/3 and Celeste without depending on any engine internals.
(function () {
  'use strict';

  var HIGHLIGHT = '#66fcf1';

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
    '#launcher-return-progress.active { opacity: 0.9; }';
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

  function mount() {
    document.body.appendChild(btn);
    document.body.appendChild(progressRing);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // Gamepad long-press: hold Select+Start (buttons 8+9) together for ~1.2s.
  var HOLD_MS = 1200;
  var holdStart = null;

  function pollGamepadReturn() {
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
