// Shared audio-unlock + gamepad support injected into the RSDK game shells
// (Sonic 1/2 and Sonic Mania). Must be loaded as a plain synchronous script
// BEFORE the Emscripten engine script, so the AudioContext hook and the
// navigator.getGamepads proxy are in place before the engine touches either.
//
// Config a game's shell can set *before* this script runs:
// - `window.__gamepadKeyMap` — either a preset name ('rsdkv4' | 'rsdkv5')
//   or a full { buttonIndex: {key, code, keyCode} } map for the
//   gamepad→keyboard translator. Defaults to 'rsdkv4'.
//
// Cooperates with `window.isDevMenuOpen()` if a dev/esc menu defines it
// (Sonic 1/2's Dev Menu, launcher-overlay.js's esc-menu mode): gameplay
// input is not forwarded while that menu is open, and Select+Start (the
// menu-toggle combo) is never forwarded to the game.
(function () {
  'use strict';

  // --- 1. AudioContext autoplay unlock -----------------------------------
  // Hook AudioContext to guarantee we capture the engine's context, then
  // resume it on the first user gesture (autoplay policies block it from
  // starting itself).
  var audioContexts = [];
  var OrigAudioContext = window.AudioContext || window.webkitAudioContext;
  if (OrigAudioContext) {
    window.AudioContext = function () {
      var ctx = new OrigAudioContext();
      audioContexts.push(ctx);
      return ctx;
    };
  }

  var audioResumed = false;
  function resumeAudio() {
    if (audioResumed) return;
    audioContexts.forEach(function (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().then(function () {
          audioResumed = true;
        }).catch(function (e) {
          console.error('Failed to resume AudioContext', e);
        });
      } else if (ctx.state === 'running') {
        audioResumed = true;
      }
    });
  }
  // Standard DOM events — the only ones browsers accept as a user gesture.
  window.addEventListener('click', resumeAudio, { once: false });
  window.addEventListener('keydown', resumeAudio, { once: false });
  window.addEventListener('touchstart', resumeAudio, { once: false });

  // --- 2. Gamepad → keyboard translator -----------------------------------
  // Bypasses SDL2's gamepad path entirely: maps standard-layout gamepad
  // buttons to the keyboard keys the engine already handles by default.
  var KEY_MAP_PRESETS = {
    // RSDKv4 (Sonic 1/2) default P1 keyboard bindings.
    rsdkv4: {
      0:  { key: 'z',          code: 'KeyZ',       keyCode: 90 }, // A → Jump
      1:  { key: 'x',          code: 'KeyX',       keyCode: 88 }, // B → Run
      2:  { key: 'c',          code: 'KeyC',       keyCode: 67 }, // X → C
      3:  { key: 's',          code: 'KeyS',       keyCode: 83 }, // Y → Y
      4:  { key: 'q',          code: 'KeyQ',       keyCode: 81 }, // LB
      5:  { key: 'e',          code: 'KeyE',       keyCode: 69 }, // RB
      8:  { key: 'Tab',        code: 'Tab',        keyCode: 9  }, // Select
      9:  { key: 'Enter',      code: 'Enter',      keyCode: 13 }, // Start
      12: { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
      13: { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
      14: { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
      15: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    },
    // RSDKv5/Mania default P1 keyboard bindings (UserCore.cpp
    // defaultKeyMaps): arrows + A/S/D (A/B/C), Q/W/E (X/Y/Z), Enter, Tab.
    rsdkv5: {
      0:  { key: 'a',          code: 'KeyA',       keyCode: 65 }, // A → keyA (jump)
      1:  { key: 's',          code: 'KeyS',       keyCode: 83 }, // B → keyB
      2:  { key: 'q',          code: 'KeyQ',       keyCode: 81 }, // X → keyX
      3:  { key: 'w',          code: 'KeyW',       keyCode: 87 }, // Y → keyY
      4:  { key: 'd',          code: 'KeyD',       keyCode: 68 }, // LB → keyC
      5:  { key: 'e',          code: 'KeyE',       keyCode: 69 }, // RB → keyZ
      8:  { key: 'Tab',        code: 'Tab',        keyCode: 9  }, // Select
      9:  { key: 'Enter',      code: 'Enter',      keyCode: 13 }, // Start
      12: { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
      13: { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
      14: { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
      15: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    },
  };

  var configured = window.__gamepadKeyMap || 'rsdkv4';
  var BUTTON_TO_KEY = typeof configured === 'string' ? KEY_MAP_PRESETS[configured] : configured;
  if (!BUTTON_TO_KEY) {
    console.error('game-input: unknown gamepad key map preset', configured);
    BUTTON_TO_KEY = KEY_MAP_PRESETS.rsdkv4;
  }

  var DEADZONE = 0.5;
  var axisState = {};                 // which axis-derived keys are held
  var pressedButtons = new Set();
  var target = document.getElementById('canvas') || window;

  function dispatchKey(type, mapping) {
    target.dispatchEvent(new KeyboardEvent(type, {
      key: mapping.key,
      code: mapping.code,
      keyCode: mapping.keyCode,
      which: mapping.keyCode,
      bubbles: true,
      cancelable: true,
    }));
  }

  function releaseAllKeys() {
    pressedButtons.forEach(function (b) {
      if (BUTTON_TO_KEY[b]) dispatchKey('keyup', BUTTON_TO_KEY[b]);
    });
    pressedButtons.clear();
    Object.keys(axisState).forEach(function (id) {
      if (axisState[id] && axisState[id].mapping) dispatchKey('keyup', axisState[id].mapping);
    });
    axisState = {};
  }

  function pollGamepad() {
    if (window.isDevMenuOpen && window.isDevMenuOpen()) {
      // Menu owns the pad right now — release anything we were holding so
      // the game doesn't keep running/jumping underneath it.
      releaseAllKeys();
      requestAnimationFrame(pollGamepad);
      return;
    }
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var p = 0; p < pads.length; p++) {
      var pad = pads[p];
      if (!pad) continue;

      // Select+Start held together is reserved as the dev/esc-menu toggle —
      // don't also forward Tab/Enter to the game.
      var menuComboHeld = !!(pad.buttons[8] && pad.buttons[8].pressed && pad.buttons[9] && pad.buttons[9].pressed);

      for (var b = 0; b < pad.buttons.length; b++) {
        var mapping = BUTTON_TO_KEY[b];
        if (!mapping) continue;
        if ((b === 8 || b === 9) && menuComboHeld) continue;
        var pressed = pad.buttons[b] && (pad.buttons[b].pressed || pad.buttons[b].value > 0.5);
        var wasPressed = pressedButtons.has(b);
        if (pressed && !wasPressed) { pressedButtons.add(b); dispatchKey('keydown', mapping); }
        if (!pressed && wasPressed) { pressedButtons.delete(b); dispatchKey('keyup', mapping); }
      }

      // Left stick → arrow keys.
      var ax = pad.axes[0] || 0;
      var ay = pad.axes[1] || 0;
      var axisMap = {
        left:  { active: ax < -DEADZONE, mapping: BUTTON_TO_KEY[14] },
        right: { active: ax >  DEADZONE, mapping: BUTTON_TO_KEY[15] },
        up:    { active: ay < -DEADZONE, mapping: BUTTON_TO_KEY[12] },
        down:  { active: ay >  DEADZONE, mapping: BUTTON_TO_KEY[13] },
      };
      Object.keys(axisMap).forEach(function (id) {
        var cfg = axisMap[id];
        var was = axisState[id] && axisState[id].active;
        if (cfg.active && !was) { axisState[id] = cfg; dispatchKey('keydown', cfg.mapping); }
        if (!cfg.active && was) { axisState[id] = null; dispatchKey('keyup', cfg.mapping); }
      });
    }
    requestAnimationFrame(pollGamepad);
  }
  requestAnimationFrame(pollGamepad);

  // --- 3. Gamepad proxy for SDL2 compatibility -----------------------------
  // Emscripten's SDL2 port only fires SDL_CONTROLLERDEVICEADDED (and thus
  // lets the engine SDL_GameControllerOpen a pad) for gamepads the browser
  // reports with mapping === "standard"; anything else is left as a plain
  // unmapped joystick the engine never opens. Force the mapping and
  // re-dispatch 'gamepadconnected' so SDL2 picks every pad up.
  if (navigator.getGamepads) {
    var origGetGamepads = navigator.getGamepads.bind(navigator);

    navigator.getGamepads = function () {
      var pads = origGetGamepads();
      if (!pads) return pads;
      // Compact: remove nulls so gamepads start at index 0.
      var realPads = Array.from(pads).filter(function (p) { return p != null; });
      var newPads = [];

      for (var i = 0; i < realPads.length; i++) {
        var pad = realPads[i];
        newPads[i] = {
          id: 'Standard Gamepad',
          mapping: 'standard',
          connected: pad.connected,
          index: i, // Force remapped index starting from 0.
          axes: pad.axes,
          buttons: pad.buttons,
          timestamp: pad.timestamp
        };

        if (!window._seenGamepads) window._seenGamepads = {};
        if (!window._seenGamepads[i]) {
          window._seenGamepads[i] = true;
          var event = new Event('gamepadconnected');
          event.gamepad = newPads[i];
          window.dispatchEvent(event);
        }
      }

      return newPads;
    };

    // Polling loop to break the chicken-and-egg problem: Emscripten waits
    // for 'gamepadconnected' before it starts polling, but our proxy only
    // fires 'gamepadconnected' when it gets polled.
    var forceGamepadPoll = function () {
      navigator.getGamepads();
      requestAnimationFrame(forceGamepadPoll);
    };
    requestAnimationFrame(forceGamepadPoll);
  }
})();
