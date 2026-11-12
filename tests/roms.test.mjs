// ROM identification, grouping and the zip reader: pure code, tested with synthetic
// cartridges (no ROMs are committed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { identify, sortVersions, stripVersion } from '../src/data/systems/mega-drive.js';
import { readZip } from '../src/services/zip.js';

/** A blank cartridge with a Mega Drive header. */
function cart({ system = 'SEGA MEGA DRIVE ', overseas = '', domestic = '', serial = 'GM 00000000-00', size = 0x8000 } = {}) {
  const bytes = new Uint8Array(size);
  const put = (at, text, len) => {
    const padded = text.padEnd(len, ' ');
    for (let i = 0; i < len; i++) bytes[at + i] = padded.charCodeAt(i);
  };
  put(0x100, system, 16);
  put(0x120, domestic, 48);
  put(0x150, overseas, 48);
  put(0x180, serial, 14);
  return bytes;
}

test('the overseas title names the game; the serial gives the revision', () => {
  const id = identify(cart({ overseas: 'OLD TOWERS', serial: 'GM 76334511-12' }), 'ot12.bin');
  assert.equal(id.gameId, 'old-towers');
  assert.equal(id.title, 'Old Towers');
  assert.equal(id.revision, '12');
  assert.equal(id.name, 'ot12');
});

test('two builds of one game share a game id', () => {
  const a = identify(cart({ overseas: 'OLD TOWERS', serial: 'GM 00000000-00' }), 'ot11.bin');
  const b = identify(cart({ overseas: 'OLD TOWERS', serial: 'GM 76334511-12' }), 'ot12.bin');
  assert.equal(a.gameId, b.gameId);
});

test('version markers in the title do not split a game', () => {
  assert.equal(stripVersion('FINAL FIGHT MD+ - V0.94b+'), 'FINAL FIGHT MD+');
  assert.equal(stripVersion('SOME GAME v1.2'), 'SOME GAME');
  assert.equal(stripVersion('PANG'), 'PANG');
  const id = identify(cart({ overseas: 'FINAL FIGHT MD+ - V0.94b+' }), 'rom.bin');
  assert.equal(id.gameId, 'final-fight-md-plus');
  assert.equal(id.title, 'Final Fight MD+');
});

test('the domestic title is the fallback, the file name the last resort', () => {
  assert.equal(identify(cart({ domestic: 'PANG' }), 'x.bin').gameId, 'pang');
  assert.equal(identify(new Uint8Array(0x8000), 'My_Homebrew.bin').title, 'My Homebrew');
  const smd = new Uint8Array(0x4000 * 4 + 512);
  assert.equal(identify(smd, 'Interleaved Game.smd').interleaved, true);
});

test('newest version first: revision, then the last added', () => {
  const sorted = sortVersions([
    { sha1: 'a', revision: '00', addedAt: 3 },
    { sha1: 'b', revision: '12', addedAt: 1 },
    { sha1: 'c', revision: '00', addedAt: 5 },
  ]);
  assert.deepEqual(sorted.map((v) => v.sha1), ['b', 'c', 'a']);
});

/** A zip with one stored and one deflated entry, written by hand. */
function zip(entries) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, method } of entries) {
    const body = method === 8 ? new Uint8Array(deflateRawSync(data)) : data;
    const n = enc.encode(name);
    const local = new Uint8Array(30 + n.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, n.length, true);
    local.set(n, 30);
    local.set(body, 30 + n.length);
    const central = new Uint8Array(46 + n.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    central.set(n, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, eocd]));
}

test('the zip reader returns stored and deflated entries intact', async () => {
  const rom = cart({ overseas: 'PANG' });
  const text = new TextEncoder().encode('readme '.repeat(100));
  const entries = readZip(zip([
    { name: 'game/rom/pang.bin', data: rom, method: 8 },
    { name: 'game/readme.txt', data: text, method: 0 },
  ]));
  assert.deepEqual(entries.map((e) => e.name), ['game/rom/pang.bin', 'game/readme.txt']);
  assert.deepEqual(await entries[0].bytes(), rom);
  assert.deepEqual(await entries[1].bytes(), text);
});

test('not a zip is said plainly', () => {
  assert.throws(() => readZip(new Uint8Array(100)), /ZIP/);
});
