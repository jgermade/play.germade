import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playableCore, resolveCores } from '../src/helpers/cores.js';

const cores = [
  { id: 'blastem', label: 'BlastEm' },
  { id: 'jgenesis', label: 'jgenesis', needs: ['webgpu'] },
  { id: 'later', label: 'Later', available: false },
];

test('a core that needs a missing feature is unavailable, with the reason', () => {
  const [blastem, jgenesis, later] = resolveCores(cores, { webgpu: false });
  assert.equal(blastem.available, true);
  assert.equal(jgenesis.available, false);
  assert.equal(jgenesis.missing, 'webgpu');
  assert.equal(later.available, false);
  assert.equal(later.missing, undefined);
});

test('with the feature, the core is available', () => {
  assert.equal(resolveCores(cores, { webgpu: true })[1].available, true);
});

test('a chosen core the browser cannot run falls back to the default', () => {
  const resolved = resolveCores(cores, {});
  assert.equal(playableCore(resolved, 'jgenesis', 'blastem'), 'blastem');
  assert.equal(playableCore(resolveCores(cores, { webgpu: true }), 'jgenesis', 'blastem'), 'jgenesis');
  assert.equal(playableCore(resolved, undefined, 'blastem'), 'blastem');
});
