// Super Nintendo identification from the internal header (src/helpers/systems/snes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identify, findHeader, SYSTEM } from '../src/helpers/systems/snes.js';

/** A cartridge image with a valid header at `at`: title, map mode, size, version, checksum. */
function cart({ size = 0x20000, at = 0x7fc0, mode = 0x20, title = 'SUPER TEST GAME', version = 0, copier = false } = {}) {
  const rom = new Uint8Array(size);
  rom.set(new TextEncoder().encode(title.padEnd(21, ' ').slice(0, 21)), at);
  rom[at + 0x15] = mode;
  rom[at + 0x17] = 0x07;
  rom[at + 0x19] = 0x01;
  rom[at + 0x1b] = version;
  rom[at + 0x3c] = 0x00;
  rom[at + 0x3d] = 0x80; // reset vector 0x8000
  let sum = 0;
  for (const b of rom) sum = (sum + b) & 0xffff;
  rom[at + 0x1c] = (sum ^ 0xffff) & 0xff;
  rom[at + 0x1d] = ((sum ^ 0xffff) >> 8) & 0xff;
  rom[at + 0x1e] = sum & 0xff;
  rom[at + 0x1f] = (sum >> 8) & 0xff;
  if (!copier) return rom;
  const out = new Uint8Array(rom.length + 512);
  out.set(rom, 512);
  return out;
}

test('the system the library files it under', () => {
  assert.equal(SYSTEM.id, 'snes');
  assert.deepEqual(SYSTEM.extensions, ['.sfc', '.smc', '.fig', '.swc']);
});

test('LoROM: title and version from the header at 0x7FC0', () => {
  const id = identify(cart({ title: 'SUPER TEST GAME', version: 1 }), 'whatever.sfc');
  assert.equal(id.layout, 'lorom');
  assert.equal(id.title, 'Super Test Game');
  assert.equal(id.gameId, 'super-test-game');
  assert.equal(id.revision, '01');
  assert.equal(id.system, 'snes');
});

test('HiROM: the header at 0xFFC0 wins', () => {
  const id = identify(cart({ size: 0x40000, at: 0xffc0, mode: 0x21, title: 'HIGH ROM GAME' }), 'x.sfc');
  assert.equal(id.layout, 'hirom');
  assert.equal(id.title, 'High Rom Game');
  assert.equal(id.revision, null);
});

test('a 512-byte copier header is skipped', () => {
  const id = identify(cart({ copier: true, title: 'HEADERED' }), 'old dump.smc');
  assert.equal(id.copierHeader, true);
  assert.equal(id.title, 'Headered');
});

test('no usable header: the file name names it', () => {
  const junk = new Uint8Array(0x20000).fill(0xff);
  assert.equal(findHeader(junk), null);
  const id = identify(junk, 'My_Homebrew.sfc');
  assert.equal(id.title, 'My Homebrew');
  assert.equal(id.layout, null);
});
