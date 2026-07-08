const INPUT = {
  up: 1 << 0,
  down: 1 << 1,
  left: 1 << 2,
  right: 1 << 3,
  lp: 1 << 4,
  mp: 1 << 5,
  hp: 1 << 6,
  lk: 1 << 7,
  mk: 1 << 8,
  hk: 1 << 9,
  start: 1 << 10,
  coin: 1 << 11,
  dip: 1 << 12,
  service: 1 << 13,
  reset: 1 << 14,
  neoGeoSettingDip: 1 << 15,
};

const KEYMAP = [
  {
    ArrowUp: INPUT.up,
    ArrowDown: INPUT.down,
    ArrowLeft: INPUT.left,
    ArrowRight: INPUT.right,
    z: INPUT.lp,
    x: INPUT.mp,
    c: INPUT.hp,
    v: INPUT.lk,
    b: INPUT.mk,
    n: INPUT.hk,
    '1': INPUT.start,
    '5': INPUT.coin,
  },
  {
    i: INPUT.up,
    k: INPUT.down,
    j: INPUT.left,
    l: INPUT.right,
    t: INPUT.lp,
    y: INPUT.mp,
    u: INPUT.hp,
    g: INPUT.lk,
    h: INPUT.mk,
    semicolon: INPUT.hk,
    '2': INPUT.start,
    '6': INPUT.coin,
  },
];

const els = {
  screen: document.querySelector('#screen'),
  status: document.querySelector('#status'),
  log: document.querySelector('#log'),
  gameTitle: document.querySelector('#game-title'),
  addRom: document.querySelector('#add-rom'),
  addBios: document.querySelector('#add-bios'),
  romList: document.querySelector('#rom-list'),
  supportList: document.querySelector('#support-list'),
  supportCount: document.querySelector('#support-count'),
  runToggle: document.querySelector('#run-toggle'),
  fullscreen: document.querySelector('#fullscreen'),
  stepFrame: document.querySelector('#step-frame'),
  p1Coin: document.querySelector('#p1-coin'),
  p1Start: document.querySelector('#p1-start'),
  p2Coin: document.querySelector('#p2-coin'),
  p2Start: document.querySelector('#p2-start'),
  dipTest: document.querySelector('#dip-test'),
  service: document.querySelector('#service'),
  softReset: document.querySelector('#soft-reset'),
  saveState: document.querySelector('#save-state'),
  loadState: document.querySelector('#load-state'),
  downloadState: document.querySelector('#download-state'),
  uploadState: document.querySelector('#upload-state'),
  memAddress: document.querySelector('#mem-address'),
  memLength: document.querySelector('#mem-length'),
  memValue: document.querySelector('#mem-value'),
  peek: document.querySelector('#peek'),
  poke: document.querySelector('#poke'),
  romInput: document.querySelector('#rom-input'),
  biosInput: document.querySelector('#bios-input'),
  stateInput: document.querySelector('#state-input'),
};

const ctx = els.screen.getContext('2d', { alpha: false });

let fw = null;
let running = false;
let rafId = 0;
let driverLoaded = false;
let currentRom = '';
let currentRomFile = null;
let currentLoadPath = '';
let currentTitle = 'FBNeo WASM';
let supportZips = [];
let nextFileId = 1;
let imageData = null;
let savedState = null;
let audioCtx = null;
let audioNode = null;
let audioReady = false;
let lastAudioFill = 0;
let driverIndexPromise = null;
let createFBNeoPromise = null;

const keyState = [0, 0];
const pulseState = [
  { mask: 0, frames: 0 },
  { mask: 0, frames: 0 },
];

function setStatus(message) {
  els.status.textContent = message;
}

function log(message) {
  const text = String(message);
  const stamp = new Date().toLocaleTimeString();
  els.log.textContent = `[${stamp}] ${text}\n${els.log.textContent}`.slice(0, 6000);
  console.log('[fbneo-wasm]', text);
}

function setTitle(title) {
  currentTitle = title || 'FBNeo WASM';
  els.gameTitle.textContent = currentTitle;
}

function setControlsEnabled(enabled) {
  const driverControlIds = [
    'run-toggle',
    'fullscreen',
    'step-frame',
    'p1-coin',
    'p1-start',
    'p2-coin',
    'p2-start',
    'dip-test',
    'service',
    'soft-reset',
    'save-state',
    'load-state',
    'download-state',
    'upload-state',
    'peek',
    'poke',
  ];
  for (const id of driverControlIds) {
    const button = document.getElementById(id);
    if (button) button.disabled = !enabled;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'ZIP';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fileCard(file, { type, active = false }) {
  const card = document.createElement('div');
  card.className = `file-card${active ? ' active' : ''}`;

  const text = document.createElement('div');
  text.className = 'file-text';

  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = file.name;

  const meta = document.createElement('div');
  meta.className = 'file-meta';
  meta.textContent = file.meta || formatBytes(file.size || file.bytes?.length);

  const remove = document.createElement('button');
  remove.className = 'delete-file';
  remove.type = 'button';
  remove.dataset.deleteFile = type;
  remove.dataset.fileId = String(file.id || '');
  remove.setAttribute('aria-label', `Remove ${file.name}`);
  remove.textContent = 'x';

  text.append(name, meta);
  card.append(text, remove);
  return card;
}

function emptyFileCard(message) {
  const empty = document.createElement('div');
  empty.className = 'file-empty';
  empty.textContent = message;
  return empty;
}

function renderLibrary() {
  els.supportCount.textContent = `${supportZips.length} support`;

  els.romList.replaceChildren(
    currentRomFile
      ? fileCard(currentRomFile, { type: 'rom', active: true })
      : emptyFileCard('No game ROM loaded.')
  );

  if (!supportZips.length) {
    els.supportList.replaceChildren(emptyFileCard('No BIOS or parent ZIPs added.'));
    return;
  }
  els.supportList.replaceChildren(...supportZips.map((file) => fileCard(file, { type: 'support' })));
}

function clearScreen() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, els.screen.width, els.screen.height);
}

function safeUnlink(path) {
  if (!fw || !path) return;
  try {
    fw.FS.unlink(path);
  } catch (_) {
    // The file may already be gone.
  }
}

function unloadCurrentDriver() {
  stopLoop();
  if (driverLoaded) {
    try {
      fw._fw_exit();
    } catch (error) {
      log(`Driver exit warning: ${error.message || error}`);
    }
  }
  driverLoaded = false;
  currentRom = '';
  currentLoadPath = '';
  savedState = null;
  imageData = null;
  setTitle('FBNeo WASM');
  setControlsEnabled(false);
  clearScreen();
}

function deleteCurrentRomFile() {
  if (!currentRomFile) return;
  const removedName = currentRomFile.name;
  const romPath = currentRomFile.path;
  const loadPath = currentLoadPath;
  unloadCurrentDriver();
  safeUnlink(romPath);
  if (loadPath && loadPath !== romPath) safeUnlink(loadPath);
  currentRomFile = null;
  renderLibrary();
  setStatus(`Removed ${removedName}. Add a ROM zip to start.`);
}

function deleteSupportFile(id) {
  const index = supportZips.findIndex((file) => String(file.id) === String(id));
  if (index < 0) return;
  const [removed] = supportZips.splice(index, 1);
  safeUnlink(removed.path);
  renderLibrary();
  setStatus(`${removed.name} removed from support ZIPs. Reload the game to apply support changes.`);
}

function ensureDir(path) {
  try {
    fw.FS.mkdirTree(path);
  } catch (_) {
    // Directory already exists.
  }
}

async function boot() {
  setControlsEnabled(false);
  setStatus('Loading WebAssembly module...');
  if (!createFBNeoPromise) {
    createFBNeoPromise = import('./fbneo-wasm.js?v=glue-1').then((module) => module.default);
  }
  const createFBNeo = await createFBNeoPromise;
  fw = await createFBNeo({
    locateFile: (file) => file.endsWith('.wasm') ? './fbneo-wasm.wasm' : `./${file}`,
    print: (s) => log(s),
    printErr: (s) => log(s),
  });
  ensureDir('/roms');
  ensureDir('/states');
  window.fw = fw;
  window.fbneoWasm = {
    run: startLoop,
    pause: stopLoop,
    step: () => stepFrame(true),
    coin: (player = 0) => pulse(player, INPUT.coin),
    start: (player = 0) => pulse(player, INPUT.start),
    saveState,
    loadState,
    peek,
    poke,
  };
  renderLibrary();
  setStatus('WASM ready. Add a ROM zip to start.');
  log('WASM ready.');
}

async function readFileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function getDriverIndex() {
  if (!driverIndexPromise) {
    driverIndexPromise = import('./driver-index.js?v=driver-index-2').then((module) => module.DRIVER_INDEX || []);
  }
  return driverIndexPromise;
}

function baseDriverName(filename) {
  return filename.replace(/\.zip$/i, '').toLowerCase();
}

function lookupDriver(name) {
  if (!fw || !fw._fw_driver_count) return null;
  const count = fw._fw_driver_count();
  for (let i = 0; i < count; i++) {
    const driverName = fw.UTF8ToString(fw._fw_driver_name(i));
    if (driverName === name) {
      return fw.UTF8ToString(fw._fw_driver_fullname(i)) || name;
    }
  }
  return null;
}

function firstDriverNames(limit = 32) {
  const names = [];
  const count = (fw && fw._fw_driver_count) ? fw._fw_driver_count() : 0;
  for (let i = 0; i < Math.min(count, limit); i++) {
    names.push(fw.UTF8ToString(fw._fw_driver_name(i)));
  }
  return names.join(', ');
}

function inspectZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 0x10000 - 22);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minOffset; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('Could not read zip directory.');

  const totalEntries = view.getUint16(eocd + 10, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries && offset + 46 <= bytes.length; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const crc = view.getUint32(offset + 16, true) >>> 0;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, '/').toLowerCase();
    if (name && !name.endsWith('/') && !name.startsWith('__macosx/')) {
      files.push({
        name: name.split('/').pop(),
        fullName: name,
        crc,
        localOffset: view.getUint32(offset + 42, true) >>> 0,
        centralOffset: offset,
        centralLength: 46 + nameLength + extraLength + commentLength,
      });
    }
    offset = nameEnd + extraLength + commentLength;
  }

  return {
    files,
    centralDirOffset,
    crcSet: new Set(files.map((file) => file.crc)),
    nameSet: new Set(files.map((file) => file.name)),
  };
}

function writeU16(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function concatByteArrays(parts, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipEntrySegments(zipInfo, bytes) {
  const entries = [...zipInfo.files].sort((a, b) => a.localOffset - b.localOffset);
  return entries.map((entry, index) => {
    const next = entries[index + 1];
    const end = next ? next.localOffset : zipInfo.centralDirOffset;
    return {
      entry,
      segment: bytes.subarray(entry.localOffset, end),
      central: bytes.subarray(entry.centralOffset, entry.centralOffset + entry.centralLength),
    };
  });
}

function mergedZipPath(filename) {
  return `/roms/__merged_${Date.now()}_${filename.replace(/[^a-z0-9_.-]/gi, '_')}`;
}

function mergeZips(primaryBytes, supportItems) {
  const sources = [{ name: 'game zip', bytes: primaryBytes }];
  for (const item of supportItems) sources.push(item);

  const localParts = [];
  const centralParts = [];
  const seenNames = new Set();
  let localLength = 0;

  for (const source of sources) {
    const zipInfo = inspectZip(source.bytes);
    for (const item of zipEntrySegments(zipInfo, source.bytes)) {
      if (seenNames.has(item.entry.name)) continue;
      seenNames.add(item.entry.name);
      localParts.push(item.segment);

      const central = new Uint8Array(item.central);
      writeU32(central, 42, localLength);
      centralParts.push(central);
      localLength += item.segment.length;
    }
  }

  const centralLength = centralParts.reduce((total, part) => total + part.length, 0);
  const entryCount = centralParts.length;
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 8, entryCount);
  writeU16(eocd, 10, entryCount);
  writeU32(eocd, 12, centralLength);
  writeU32(eocd, 16, localLength);

  return concatByteArrays([...localParts, ...centralParts, eocd], localLength + centralLength + eocd.length);
}

function scoreDriver(driver, zipInfo, baseName) {
  let crcMatches = 0;
  let nameMatches = 0;
  for (const crc of driver.c || []) {
    if (zipInfo.crcSet.has(crc >>> 0)) crcMatches++;
  }
  for (const name of driver.f || []) {
    if (zipInfo.nameSet.has(name)) nameMatches++;
  }

  const exactName = driver.n === baseName;
  if (!exactName && crcMatches === 0 && nameMatches === 0) return null;

  const expectedCrcs = Math.max(1, driver.c ? driver.c.length : 0);
  const zipCrcs = Math.max(1, zipInfo.crcSet.size);
  const driverCoverage = crcMatches / expectedCrcs;
  const zipCoverage = crcMatches / zipCrcs;
  const strongContentMatch =
    crcMatches >= Math.min(3, expectedCrcs) ||
    (expectedCrcs <= 2 && crcMatches === expectedCrcs) ||
    nameMatches >= 2 ||
    driverCoverage >= 0.35 ||
    zipCoverage >= 0.35;
  if (!exactName && !strongContentMatch) return null;

  let score = (crcMatches * 1000) + (nameMatches * 25);
  if (exactName) score += 100000;
  if (driverCoverage >= 0.85) score += 600;
  if (zipCoverage >= 0.85) score += 300;

  return {
    name: driver.n,
    parent: driver.p || '',
    score,
    crcMatches,
    nameMatches,
    expectedCrcs,
    driverCoverage,
    zipCoverage,
    reason: exactName ? 'filename' : 'zip contents',
  };
}

async function detectDriverCandidates(filename, bytes) {
  const baseName = baseDriverName(filename);
  const index = await getDriverIndex();
  let zipInfo = null;
  try {
    zipInfo = inspectZip(bytes);
  } catch (error) {
    log(`Zip inspection failed: ${error.message || error}`);
  }

  const candidates = [];
  const seen = new Set();
  const push = (candidate) => {
    if (!candidate || !candidate.name || seen.has(candidate.name)) return;
    seen.add(candidate.name);
    candidates.push(candidate);
  };
  const exact = index.find((driver) => driver.n === baseName);

  if (exact && zipInfo) {
    push(scoreDriver(exact, zipInfo, baseName));
  }
  if (exact && !seen.has(exact.n)) {
    push({
      name: exact.n,
      parent: exact.p || '',
      score: 0,
      crcMatches: 0,
      nameMatches: 0,
      expectedCrcs: exact.c ? exact.c.length : 0,
      reason: 'filename',
    });
  }
  if (!exact) {
    push({
      name: baseName,
      parent: '',
      score: 0,
      crcMatches: 0,
      nameMatches: 0,
      expectedCrcs: 0,
      reason: 'filename',
    });
  }

  if (zipInfo) {
    const scored = [];
    for (const driver of index) {
      if (seen.has(driver.n)) continue;
      const candidate = scoreDriver(driver, zipInfo, baseName);
      if (candidate) scored.push(candidate);
    }
    scored.sort((a, b) =>
      b.score - a.score ||
      b.crcMatches - a.crcMatches ||
      a.expectedCrcs - b.expectedCrcs ||
      a.name.localeCompare(b.name)
    );
    for (const candidate of scored.slice(0, 8)) push(candidate);
  }

  return candidates;
}

async function loadSupportFiles(files) {
  if (!fw) return;
  ensureDir('/roms');
  for (const file of files) {
    const bytes = await readFileBytes(file);
    const path = `/roms/${file.name}`;
    const existingIndex = supportZips.findIndex((item) => item.name === file.name);
    if (existingIndex >= 0) {
      safeUnlink(supportZips[existingIndex].path);
      supportZips.splice(existingIndex, 1);
    }
    fw.FS.writeFile(path, bytes);
    supportZips.push({
      id: nextFileId++,
      name: file.name,
      path,
      size: bytes.length,
      bytes,
      meta: `Support - ${formatBytes(bytes.length)}`,
    });
    log(`Support ZIP loaded at ${path}`);
  }
  renderLibrary();
  setStatus(`Support ZIPs loaded: ${supportZips.map((item) => item.name).join(', ')}`);
}

async function loadRomFile(file) {
  if (!fw) return;
  const bytes = await readFileBytes(file);
  const candidates = await detectDriverCandidates(file.name, bytes);
  const path = `/roms/${file.name}`;
  let loadPath = path;
  const previousRomPath = currentRomFile?.path || '';
  const previousLoadPath = currentLoadPath;

  unloadCurrentDriver();
  safeUnlink(previousRomPath);
  if (previousLoadPath && previousLoadPath !== previousRomPath) safeUnlink(previousLoadPath);
  ensureDir('/roms');
  fw.FS.writeFile(path, bytes);
  currentRomFile = {
    id: nextFileId++,
    name: file.name,
    path,
    size: bytes.length,
    meta: formatBytes(bytes.length),
  };
  currentLoadPath = path;
  renderLibrary();
  fw.ccall('fw_set_bios_zip', null, ['string'], ['']);
  if (supportZips.length) {
    const mergedBytes = mergeZips(bytes, supportZips);
    loadPath = mergedZipPath(file.name);
    fw.FS.writeFile(loadPath, mergedBytes);
    currentLoadPath = loadPath;
    log(`Merged ${file.name} with support ZIPs: ${supportZips.map((item) => item.name).join(', ')}`);
  }

  setStatus(`Loading ${file.name}${supportZips.length ? ' with support ZIPs' : ''}...`);
  log(`Driver candidates: ${candidates.map((candidate) => candidate.name).join(', ')}`);

  let loadedCandidate = null;
  let lastError = 0;
  for (const candidate of candidates) {
    log(`Trying ${loadPath} as driver "${candidate.name}" (${candidate.reason}, ${candidate.crcMatches || 0}/${candidate.expectedCrcs || 0} CRCs)`);
    const ret = fw.ccall('fw_init', 'number', ['string', 'string'], [loadPath, candidate.name]);
    if (ret === 0) {
      loadedCandidate = candidate;
      break;
    }
    lastError = ret;
    try {
      fw._fw_exit();
    } catch (_) {
      // Some failure paths never entered a driver; nothing to tear down.
    }
  }

  if (!loadedCandidate) {
    driverLoaded = false;
    setControlsEnabled(false);
    const tried = candidates.map((candidate) => candidate.name).join(', ');
    const parentCandidate = candidates.find((candidate) => candidate.parent);
    if (parentCandidate && !supportZips.length) {
      setStatus(`Detected ${parentCandidate.name}, but it may need parent/support ROMs. Load ${parentCandidate.parent}.zip with Add Support ZIP, then load ${file.name} again.`);
    } else if (parentCandidate) {
      setStatus(`Could not start ${file.name}. Detected ${parentCandidate.name}, but the loaded support ZIPs did not satisfy it. Try a merged set or add ${parentCandidate.parent}.zip.`);
    } else {
      setStatus(`Could not start ${file.name}. Tried: ${tried}. Use a merged zip or add any required BIOS/parent zip with Add Support ZIP.`);
    }
    if (currentRomFile) currentRomFile.meta = `Not loaded - ${formatBytes(bytes.length)}`;
    renderLibrary();
    log(`All candidates failed. Last fw_init return code: ${lastError}. First known drivers after init: ${firstDriverNames()}`);
    return;
  }

  const name = loadedCandidate.name;
  const title = lookupDriver(name) || name;
  driverLoaded = true;
  currentRom = name;
  if (currentRomFile) {
    currentRomFile.meta = `${name} - ${formatBytes(bytes.length)}`;
  }
  savedState = null;
  imageData = null;
  setTitle(title);
  setControlsEnabled(true);
  renderLibrary();
  drawFrame();
  setStatus(`${title} loaded. Keyboard: P1 arrows/Z X C V B N, 1 start, 5 coin. P2 I J K L/T Y U G H ;, 2 start, 6 coin.`);
  await startLoop();
}

function readInput(player) {
  return keyState[player] | pulseState[player].mask;
}

function decayPulses() {
  for (const pulseInfo of pulseState) {
    if (pulseInfo.frames > 0) {
      pulseInfo.frames -= 1;
      if (pulseInfo.frames === 0) pulseInfo.mask = 0;
    }
  }
}

function pulse(player, mask, frames = 18) {
  const slot = player === 1 ? 1 : 0;
  pulseState[slot].mask |= mask;
  pulseState[slot].frames = Math.max(pulseState[slot].frames, frames);
}

function drawFrame() {
  if (!driverLoaded) return;
  const ptr = fw._fw_get_framebuffer();
  const width = fw._fw_get_width();
  const height = fw._fw_get_height();
  if (!ptr || !width || !height) return;

  if (els.screen.width !== width || els.screen.height !== height || !imageData) {
    els.screen.width = width;
    els.screen.height = height;
    imageData = ctx.createImageData(width, height);
  }

  const frame = new Uint8Array(fw.HEAPU8.buffer, ptr, width * height * 4);
  imageData.data.set(frame);
  ctx.putImageData(imageData, 0, 0);
}

async function initAudio() {
  if (audioCtx) {
    if (audioCtx.state !== 'running') await audioCtx.resume();
    return;
  }
  const rate = fw._fw_get_audio_rate ? fw._fw_get_audio_rate() : 48000;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: rate });
  await audioCtx.audioWorklet.addModule('./audio-worklet.js');
  audioNode = new AudioWorkletNode(audioCtx, 'fw-player', { outputChannelCount: [2] });
  audioNode.port.onmessage = (event) => {
    if (event.data && typeof event.data.fill === 'number') lastAudioFill = event.data.fill;
  };
  audioNode.connect(audioCtx.destination);
  audioReady = true;
  if (audioCtx.state !== 'running') await audioCtx.resume();
  log(`Audio ready at ${audioCtx.sampleRate} Hz`);
}

function pushAudio() {
  if (!audioReady || !audioNode) return;
  const ptr = fw._fw_get_audio();
  const samples = fw._fw_get_audio_samples();
  if (!ptr || !samples) return;
  const len = samples * 2;
  const pcm = new Int16Array(fw.HEAP16.buffer, ptr, len);
  const chunk = new Float32Array(len);
  for (let i = 0; i < len; i++) chunk[i] = pcm[i] / 32768;
  audioNode.port.postMessage(chunk, [chunk.buffer]);
}

function stepFrame(shouldDraw = false) {
  if (!driverLoaded) return;
  fw._fw_run_frame(readInput(0), readInput(1));
  decayPulses();
  pushAudio();
  if (shouldDraw) drawFrame();
}

async function startLoop() {
  if (!driverLoaded) {
    setStatus('Add a ROM zip before running.');
    return;
  }
  if (running) return;
  try {
    await initAudio();
  } catch (error) {
    log(`Audio unavailable: ${error.message || error}`);
  }
  running = true;
  els.runToggle.textContent = 'Pause';

  const fps = Math.max(1, ((fw._fw_get_fps_x100 ? fw._fw_get_fps_x100() : 6000) || 6000) / 100);
  const frameMs = 1000 / fps;
  let lastNow = performance.now();
  let budget = 0;

  function tick(now) {
    if (!running) return;
    const delta = now - lastNow;
    budget += Math.min(delta, 250);
    lastNow = now;

    let produced = 0;
    while (budget >= frameMs && produced < 4) {
      if (lastAudioFill > fw._fw_get_audio_samples() * 40) break;
      stepFrame(false);
      budget -= frameMs;
      produced++;
    }
    if (produced > 0) drawFrame();
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  running = false;
  els.runToggle.textContent = 'Run';
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function saveState() {
  if (!driverLoaded) return null;
  const size = fw._fw_state_size();
  const ptr = fw._malloc(size);
  try {
    fw._fw_save_state(ptr);
    savedState = fw.HEAPU8.slice(ptr, ptr + size);
    setStatus(`State saved in memory (${size} bytes).`);
    log(`State saved: ${size} bytes`);
    return savedState;
  } finally {
    fw._free(ptr);
  }
}

function loadState(bytes = savedState) {
  if (!driverLoaded || !bytes) {
    setStatus('No state is available to load.');
    return;
  }
  const ptr = fw._malloc(bytes.length);
  try {
    fw.HEAPU8.set(bytes, ptr);
    fw._fw_load_state(ptr);
    drawFrame();
    setStatus(`State loaded (${bytes.length} bytes).`);
    log(`State loaded: ${bytes.length} bytes`);
  } finally {
    fw._free(ptr);
  }
}

function downloadCurrentState() {
  const bytes = savedState || saveState();
  if (!bytes) return;
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${currentRom || 'fbneo'}.state`;
  link.click();
  URL.revokeObjectURL(url);
}

function parseHex(value) {
  const clean = String(value || '').trim().replace(/^0x/i, '');
  if (!clean) return NaN;
  return Number.parseInt(clean, 16);
}

function peek(addr = parseHex(els.memAddress.value), len = Number.parseInt(els.memLength.value || '1', 10)) {
  if (!driverLoaded) return null;
  const length = Math.max(1, Math.min(256, len || 1));
  if (!Number.isFinite(addr)) {
    setStatus('Enter a memory address first.');
    return null;
  }
  const ptr = fw._malloc(length);
  try {
    const ok = fw._fw_peek(addr >>> 0, length, ptr);
    if (!ok) {
      setStatus('Memory peek is not supported for this hardware family.');
      return null;
    }
    const bytes = fw.HEAPU8.slice(ptr, ptr + length);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    log(`peek 0x${(addr >>> 0).toString(16)} (${length}): ${hex}`);
    setStatus(`0x${(addr >>> 0).toString(16)} = ${hex}`);
    return bytes;
  } finally {
    fw._free(ptr);
  }
}

function poke(addr = parseHex(els.memAddress.value), value = parseHex(els.memValue.value)) {
  if (!driverLoaded) return false;
  if (!Number.isFinite(addr) || !Number.isFinite(value)) {
    setStatus('Enter a memory address and byte value first.');
    return false;
  }
  const ok = fw._fw_poke(addr >>> 0, value & 0xff);
  if (ok) {
    log(`poke 0x${(addr >>> 0).toString(16)} = 0x${(value & 0xff).toString(16).padStart(2, '0')}`);
    setStatus('Memory byte written.');
    return true;
  }
  setStatus('Memory poke is not supported for this hardware family.');
  return false;
}

function isTypingTarget(target) {
  return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
}

function normalizeKey(event) {
  if (event.key === ';') return 'semicolon';
  if (event.key.length === 1) return event.key.toLowerCase();
  return event.key;
}

function bindEvents() {
  els.addRom.addEventListener('click', () => els.romInput.click());
  els.addBios.addEventListener('click', () => els.biosInput.click());
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-file]');
    if (!button) return;
    const type = button.dataset.deleteFile;
    if (type === 'rom') {
      deleteCurrentRomFile();
    } else if (type === 'support') {
      deleteSupportFile(button.dataset.fileId);
    }
  });
  els.romInput.addEventListener('change', () => {
    const file = els.romInput.files && els.romInput.files[0];
    if (file) loadRomFile(file).catch((error) => {
      setStatus(`ROM load failed: ${error.message || error}`);
      log(error.stack || error);
    });
    els.romInput.value = '';
  });
  els.biosInput.addEventListener('change', () => {
    const files = els.biosInput.files ? Array.from(els.biosInput.files) : [];
    if (files.length) loadSupportFiles(files).catch((error) => {
      setStatus(`Support ZIP load failed: ${error.message || error}`);
      log(error.stack || error);
    });
    els.biosInput.value = '';
  });
  els.stateInput.addEventListener('change', async () => {
    const file = els.stateInput.files && els.stateInput.files[0];
    if (file) loadState(await readFileBytes(file));
    els.stateInput.value = '';
  });

  els.runToggle.addEventListener('click', () => running ? stopLoop() : startLoop());
  els.fullscreen.addEventListener('click', () => {
    const cabinet = document.querySelector('.cabinet');
    if (cabinet && cabinet.requestFullscreen) cabinet.requestFullscreen();
  });
  els.stepFrame.addEventListener('click', () => stepFrame(true));
  els.p1Coin.addEventListener('click', () => pulse(0, INPUT.coin));
  els.p1Start.addEventListener('click', () => pulse(0, INPUT.start));
  els.p2Coin.addEventListener('click', () => pulse(1, INPUT.coin));
  els.p2Start.addEventListener('click', () => pulse(1, INPUT.start));
  els.dipTest.addEventListener('click', () => pulse(0, INPUT.dip | INPUT.neoGeoSettingDip, 24));
  els.service.addEventListener('click', () => pulse(0, INPUT.service, 18));
  els.softReset.addEventListener('click', () => pulse(0, INPUT.reset, 12));
  els.saveState.addEventListener('click', () => saveState());
  els.loadState.addEventListener('click', () => loadState());
  els.downloadState.addEventListener('click', () => downloadCurrentState());
  els.uploadState.addEventListener('click', () => els.stateInput.click());
  els.peek.addEventListener('click', () => peek());
  els.poke.addEventListener('click', () => poke());

  window.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = normalizeKey(event);
    for (let player = 0; player < KEYMAP.length; player++) {
      const mask = KEYMAP[player][key];
      if (mask) {
        keyState[player] |= mask;
        event.preventDefault();
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = normalizeKey(event);
    for (let player = 0; player < KEYMAP.length; player++) {
      const mask = KEYMAP[player][key];
      if (mask) {
        keyState[player] &= ~mask;
        event.preventDefault();
      }
    }
  });
}

bindEvents();
boot().catch((error) => {
  setStatus(`WASM failed to load: ${error.message || error}`);
  log(error.stack || error);
});
