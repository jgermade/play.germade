import fs from 'fs';
import path from 'path';

const TARGET_DIR = path.resolve(process.cwd(), 'public/game/celeste');
const frameworkDir = path.join(TARGET_DIR, '_framework');

// 1. Patch game.html
const indexHtmlPath = path.join(TARGET_DIR, 'game.html');
if (fs.existsSync(indexHtmlPath)) {
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  const mainThreadProxyScript = `
<script>
  // Gamepad SharedArrayBuffer Proxy - Main Thread
  (function() {
    window.gamepadSAB = new SharedArrayBuffer(1024);
    const view = new Float32Array(window.gamepadSAB);
    
    function updateGamepads() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let count = 0;
      let offset = 1;
      
      for (let i = 0; i < gamepads.length && count < 4; i++) {
        const gp = gamepads[i];
        if (!gp || !gp.connected) continue;
        
        count++;
        view[offset++] = 1; // connected
        view[offset++] = gp.index;
        
        const axes = gp.axes || [];
        view[offset++] = axes.length;
        const buttons = gp.buttons || [];
        view[offset++] = buttons.length;
        
        for (let a = 0; a < 10; a++) {
          view[offset++] = a < axes.length ? axes[a] : 0;
        }
        
        for (let b = 0; b < 20; b++) {
          const btn = buttons[b];
          view[offset++] = b < buttons.length ? (typeof btn === 'object' ? btn.value : btn) : 0;
        }
      }
      view[0] = count;
      
      requestAnimationFrame(updateGamepads);
    }
    requestAnimationFrame(updateGamepads);

    const OriginalWorker = window.Worker;
    window.Worker = function(scriptURL, options) {
      const w = new OriginalWorker(scriptURL, options);
      w.postMessage({ type: 'GAMEPAD_SAB', sab: window.gamepadSAB });
      return w;
    };
    
    // Exit Hooks
    const _close = window.close;
    window.close = function() {
      if (window.parent) window.parent.postMessage({ type: 'CELESTE_EXIT' }, '*');
      if (_close) return _close.apply(this, arguments);
    };
    
    window.Module = window.Module || {};
    const _onExit = window.Module.onExit;
    window.Module.onExit = function() {
      if (window.parent) window.parent.postMessage({ type: 'CELESTE_EXIT' }, '*');
      if (_onExit) return _onExit.apply(this, arguments);
    };
  })();
</script>`;

  if (!indexHtml.includes('Gamepad SharedArrayBuffer Proxy')) {
    indexHtml = indexHtml.replace('</head>', `${mainThreadProxyScript}\n\t</head>`);
    fs.writeFileSync(indexHtmlPath, indexHtml);
    console.log('Patched index.html with Gamepad Proxy');
  }
}

// 2. Patch dotnet.native.worker.*.mjs
if (fs.existsSync(frameworkDir)) {
  const files = fs.readdirSync(frameworkDir);
  const workerFile = files.find(f => f.startsWith('dotnet.native.worker.') && f.endsWith('.mjs'));

  if (workerFile) {
    const workerFilePath = path.join(frameworkDir, workerFile);
    let workerCode = fs.readFileSync(workerFilePath, 'utf8');

    const workerProxyScript = `
// Gamepad SharedArrayBuffer Proxy - Worker Thread
let gamepadView = null;
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GAMEPAD_SAB') {
    gamepadView = new Float32Array(e.data.sab);
  }
});

if (typeof navigator !== 'undefined') {
  navigator.getGamepads = function() {
    if (!gamepadView) return [];
    const gamepads = [];
    const count = gamepadView[0];
    let offset = 1;
    
    // According to MDN and Emscripten SDL implementation, 
    // it expects an array where indices match the gamepad index.
    // Emscripten's JSEvents.lastGamepadState does exactly this.
    for (let i = 0; i < count; i++) {
      const connected = gamepadView[offset++];
      if (!connected) continue;
      const index = gamepadView[offset++];
      const numAxes = gamepadView[offset++];
      const numButtons = gamepadView[offset++];
      
      const axes = [];
      for (let a = 0; a < 10; a++) {
        if (a < numAxes) axes.push(gamepadView[offset]);
        offset++;
      }
      
      const buttons = [];
      for (let b = 0; b < 20; b++) {
        if (b < numButtons) {
          const val = gamepadView[offset];
          buttons.push({ pressed: val > 0.5, value: val });
        }
        offset++;
      }
      
      gamepads[index] = {
        id: "Standard Gamepad",
        mapping: "standard",
        connected: true,
        index: index,
        axes: axes,
        buttons: buttons
      };
    }
    
    // Ensure the array has elements up to the highest index, filled with null for disconnected
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] === undefined) {
        gamepads[i] = null;
      }
    }
    return gamepads;
  };
}
`;

    if (!workerCode.includes('Gamepad SharedArrayBuffer Proxy')) {
      fs.writeFileSync(workerFilePath, workerProxyScript + '\n' + workerCode);
      console.log('Patched ' + workerFile + ' with Gamepad Proxy');
    }
  }
}
