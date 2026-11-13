// The catalog is data the launcher trusts blindly, so check it here instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, GAMES, rows } from '../src/data/catalog.js';

const engines = JSON.parse(readFileSync(new URL('../src/data/engines.json', import.meta.url), 'utf8'));

test('slugs are unique and usable as a storage namespace', () => {
  const slugs = GAMES.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  // Slugs are paths (/sonic1/, /megadrive/) and storage namespaces: lowercase, no separators.
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+$/);
});

test('every game sits in a known category', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const game of GAMES) assert.ok(ids.has(game.category), `${game.slug}: ${game.category}`);
  assert.equal(rows().reduce((n, row) => n + row.games.length, 0), GAMES.length);
});

test('a playable game has a pinned engine and says what to install', () => {
  for (const game of GAMES.filter((g) => g.status === 'ready')) {
    const engine = engines[game.engine];
    assert.ok(engine, `${game.slug}: ${game.engine} is not in engines.json`);
    assert.match(engine.version, /^\d+\.\d+\.\d+$/);
    if (game.kind === 'game') {
      assert.ok(Object.keys(game.install ?? {}).length > 0, `${game.slug}: nothing to install`);
      for (const spec of Object.values(game.install)) {
        assert.ok(spec.file && !spec.file.includes('/'), `${game.slug}: bad file ${spec.file}`);
        for (const ext of spec.accept ?? []) assert.match(ext, /^\.[a-z0-9]+$/);
      }
    }
  }
});

test('kinds are known', () => {
  for (const game of GAMES) assert.ok(['game', 'emulator'].includes(game.kind), game.slug);
});

test('a system entry is its own library: system id = slug', () => {
  for (const game of GAMES.filter((g) => g.kind === 'emulator' && g.system)) assert.equal(game.system, game.slug);
});
