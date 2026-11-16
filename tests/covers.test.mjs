// Which boxes a game tries, in order (src/helpers/covers.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverCandidates, regionOrder } from '../src/helpers/covers.js';

test('a world-only game gets its * box', () => {
  assert.deepEqual(coverCandidates({}, 'w.png'), [{ region: null, url: 'w.png' }]);
});

test('region boxes come before the World box, the player’s regions first', () => {
  const got = coverCandidates({ EU: 'eu', US: 'us', JP: 'jp' }, 'w', ['JP'], 'US');
  assert.deepEqual(got.map((c) => c.region), ['JP', 'US', 'EU', null]);
});

test('nothing when there is nothing', () => {
  assert.deepEqual(coverCandidates({}, null), []);
  assert.deepEqual(regionOrder('JP'), ['JP', 'EU', 'US']);
});
