// The systems the launcher shows (src/helpers/systems.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEMS, touchSystemFor } from '../src/helpers/systems.js';

test('every system has its id, title and extensions', () => {
  for (const [id, system] of Object.entries(SYSTEMS)) {
    assert.equal(system.id, id);
    assert.ok(system.title && system.extensions.length);
  }
  assert.equal(SYSTEMS.neogeo.biosDriver, 'neogeo');
});

test('Game Boy carts in the GBA library get the Game Boy pad', () => {
  assert.equal(touchSystemFor('gba', { platform: 'gb' }), 'gb');
  assert.equal(touchSystemFor('gba', {}), 'gba');
  assert.equal(touchSystemFor('megadrive', { platform: 'gb' }), 'megadrive');
});

test('a box keeps the area of a 78px square in its own proportions', async () => {
  const { BOX_RATIO, boxShape } = await import('../src/helpers/systems.js');
  assert.deepEqual(boxShape(1), { w: 78, h: 78 });
  assert.deepEqual(boxShape(BOX_RATIO.MegaDrive), { w: 65, h: 93 });
  assert.deepEqual(boxShape(BOX_RATIO.SNES), { w: 92, h: 66 });
  assert.deepEqual(boxShape(0.1), boxShape(0.45)); // clamped
  assert.equal(BOX_RATIO.GAMEBOY, 1);
});
