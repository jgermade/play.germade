// The four layers, kept honest (the owner's structure for every front end):
//   helpers     functions with no dependencies and no memory: they import helpers only;
//   components  no memory, no dependencies but helpers (and other components);
//   lib         services, stores and data: helpers and lib;
//   views       put all of it together.
// Reads every relative import of every file and fails on one that reaches a layer it may not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(new URL('../src', import.meta.url).pathname);
const ALLOWED = {
  helpers: ['helpers'],
  components: ['components', 'helpers'],
  lib: ['lib', 'helpers'],
  views: ['views', 'components', 'lib', 'helpers'],
};
const SPECIFIER = /(?:from\s*|import\s*\(\s*(?:\/\*[^*]*\*\/\s*)?)['"](\.{1,2}\/[^'"]+)['"]/g;
const layerOf = (path) => relative(SRC, path).split(/[\\/]/)[0];

for (const [layer, allowed] of Object.entries(ALLOWED)) {
  test(`${layer} imports only ${allowed.join(', ')}`, () => {
    const violations = [];
    const files = readdirSync(join(SRC, layer), { recursive: true }).filter((f) => /\.(js|html)$/.test(f));
    for (const file of files) {
      const path = join(SRC, layer, file);
      for (const [, spec] of readFileSync(path, 'utf8').matchAll(SPECIFIER)) {
        const reached = layerOf(resolve(dirname(path), spec));
        if (reached in ALLOWED && !allowed.includes(reached)) violations.push(`${relative(SRC, path)} → ${spec}`);
      }
    }
    assert.deepEqual(violations, []);
  });
}
