// Game Boy Advance / Game Boy / Color identification from the header (src/helpers/systems/gba.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identify, platformOf, touchSystemOf, gbaHeader, gbHeader, SYSTEM } from '../src/helpers/systems/gba.js';

/** A GBA cart with a valid header: title, game code, version, complement. */
function gbaCart({ title = 'TEST GAME', code = 'BTSE', version = 0 } = {}) {
  const rom = new Uint8Array(0x400);
  rom.set(new TextEncoder().encode(title.slice(0, 12)), 0xa0);
  rom.set(new TextEncoder().encode(code), 0xac);
  rom.set(new TextEncoder().encode('01'), 0xb0);
  rom[0xb2] = 0x96;
  rom[0xbc] = version;
  let sum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) sum = (sum + rom[i]) & 0xff;
  rom[0xbd] = (-(sum + 0x19)) & 0xff;
  return rom;
}

/** A Game Boy cart with a valid header checksum; `cgb` is the 0x143 flag. */
function gbCart({ title = 'TEST GB', cgb = 0x00, version = 0 } = {}) {
  const rom = new Uint8Array(0x8000);
  rom.set(new TextEncoder().encode(title.slice(0, cgb ? 11 : 16)), 0x134);
  rom[0x143] = cgb;
  rom[0x14c] = version;
  let x = 0;
  for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  rom[0x14d] = x;
  return rom;
}

test('one library for the three handhelds', () => {
  assert.equal(SYSTEM.id, 'gba');
  for (const ext of ['.gba', '.gb', '.gbc']) assert.ok(SYSTEM.extensions.includes(ext), ext);
});

test('GBA: title, game code and version from the header', () => {
  const id = identify(gbaCart({ title: 'POKEMON EMER', code: 'BPEE', version: 1 }), 'x.gba');
  assert.equal(id.platform, 'gba');
  assert.equal(id.serial, 'BPEE');
  assert.equal(id.revision, '01');
  assert.equal(id.system, 'gba');
  assert.equal(id.gameId, 'pokemon-emer');
});

test('GBA: a broken complement is not a header', () => {
  const rom = gbaCart();
  rom[0xbd] ^= 0xff;
  assert.equal(gbaHeader(rom), null);
});

test('Game Boy: title and version; DMG carts are gb', () => {
  const id = identify(gbCart({ title: 'TETRIS', version: 1 }), 'tetris.gb');
  assert.equal(id.platform, 'gb');
  assert.equal(id.title, 'Tetris');
  assert.equal(id.revision, '01');
  assert.equal(id.serial, null);
});

test('Game Boy Color: the CGB flag (dual and Color-only) makes it gbc, title stops at 11', () => {
  assert.equal(platformOf(gbCart({ title: 'ZELDA DX', cgb: 0x80 })), 'gbc');
  const only = gbCart({ title: 'POKEMON CRY', cgb: 0xc0 });
  assert.equal(gbHeader(only).colorOnly, true);
  assert.equal(identify(only, 'c.gbc').title, 'Pokemon Cry');
});

test('no header: the file name and the extension decide', () => {
  const blank = new Uint8Array(0x200);
  assert.equal(platformOf(blank, 'homebrew.gb'), 'gb');
  assert.equal(platformOf(blank, 'homebrew.gbc'), 'gbc');
  assert.equal(platformOf(blank, 'homebrew.gba'), 'gba');
  assert.equal(identify(blank, 'My_Homebrew.gba').title, 'My Homebrew');
});

test('the pad follows the cart: Game Boy carts get the Game Boy layout', () => {
  assert.equal(touchSystemOf({ platform: 'gb', file: 'a.gb' }), 'gb');
  assert.equal(touchSystemOf({ file: 'abc.gbc' }), 'gbc');
  assert.equal(touchSystemOf({ file: 'abc.gba' }), 'gba');
});
