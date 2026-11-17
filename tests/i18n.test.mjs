// Every string the launcher shows exists in English and Spanish (the ecosystem's rule), and so
// does every catalog text a player reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES } from '../src/lib/messages.js';
import { CATEGORIES, GAMES } from '../src/lib/catalog.js';

test('every message has English and Spanish', () => {
  const missing = Object.entries(MESSAGES).filter(([, m]) => !m.en || !m.es).map(([key]) => key);
  assert.deepEqual(missing, []);
});

test('the plural messages come in pairs', () => {
  const words = new Set(Object.keys(MESSAGES).filter((k) => /\.(one|many)$/.test(k)).map((k) => k.replace(/\.(one|many)$/, '')));
  for (const word of words) {
    assert.ok(MESSAGES[`${word}.one`] && MESSAGES[`${word}.many`], word);
  }
});

const bilingual = (value) => typeof value === 'object' && value !== null && value.en && value.es;

test('the catalog texts a player reads are English and Spanish', () => {
  for (const category of CATEGORIES) {
    assert.ok(bilingual(category.title), `${category.id}.title`);
    assert.ok(bilingual(category.subtitle), `${category.id}.subtitle`);
  }
  for (const game of GAMES) {
    assert.ok(bilingual(game.description), `${game.slug}.description`);
    if (game.kicker && /[a-z]{4,}/i.test(JSON.stringify(game.kicker).replace(/bits|SNK|AES|Sega|Nintendo/g, ''))) {
      assert.ok(bilingual(game.kicker), `${game.slug}.kicker`);
    }
    for (const [key, spec] of Object.entries(game.install ?? {})) assert.ok(bilingual(spec.label), `${game.slug}.install.${key}`);
    if (game.bios) assert.ok(bilingual(game.bios.label), `${game.slug}.bios`);
  }
});
