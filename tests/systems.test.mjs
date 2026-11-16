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
