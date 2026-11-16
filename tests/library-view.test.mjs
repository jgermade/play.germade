// rom-manager's index as the launcher shows it (src/helpers/library-view.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crcNumber, extensionSystemOf, gamesOf, launcherSystemsOf, modStatus, versionForMod } from '../src/helpers/library-view.js';

const gb = {
  version: 1,
  system: 'GAMEBOY',
  games: {
    tetris: {
      title: 'Tetris',
      versions: [
        { path: 'GAMEBOY/Tetris (World).gb', crc: 'AAAAAAAA', size: 32768, variant: 'World', regions: ['EU'], verified: true },
        { path: 'GAMEBOY/Tetris (World) (Rev 1).gb', crc: '46DF91AD', size: 32768, variant: 'World-rev1', revision: 'rev1', regions: ['EU'], verified: true },
      ],
      mods: [
        { sha1: 'e'.repeat(40), name: 'Turbo', format: 'ups', path: '.meta/GAMEBOY/mods/x.ups', sourceCrc: '46DF91AD', fits: '46DF91AD' },
        { sha1: 'f'.repeat(40), name: 'Alien', format: 'bps', path: '.meta/GAMEBOY/mods/y.bps', sourceCrc: '12345678' },
        { sha1: 'a'.repeat(40), name: 'Ips', format: 'ips', path: '.meta/GAMEBOY/mods/z.ips' },
      ],
    },
    'mods-only': { title: 'Gone', versions: [], mods: [] },
  },
};
const gbaIndex = { version: 1, system: 'GBA', games: { tetris: { title: 'Tetris', versions: [{ path: 'GBA/Tetris.gba', crc: '0000BEEF', regions: [], verified: false }], mods: [] } } };

test('maps systems both ways', () => {
  assert.deepEqual(launcherSystemsOf('GAMEBOY'), ['gba']);
  assert.deepEqual(launcherSystemsOf('PSX'), []);
  assert.equal(extensionSystemOf('gba', 'x.gb'), 'GAMEBOY');
  assert.equal(extensionSystemOf('gba', 'x.gbc'), 'GBC');
  assert.equal(extensionSystemOf('gba', 'x.gba'), 'GBA');
  assert.equal(extensionSystemOf('megadrive', 'x.bin'), 'MegaDrive');
  assert.equal(crcNumber('46DF91AD'), 0x46df91ad);
});

test('builds the view: versions newest first, mods with their status, engines from the prefs', () => {
  const view = gamesOf('gba', [gb, gbaIndex], { systems: { gba: 'mgba' }, games: { 'gba/tetris': 'other' } });
  assert.equal(view.core, 'mgba');
  assert.deepEqual(view.games.map((g) => g.key), ['GAMEBOY:tetris', 'GBA:tetris']);
  const tetris = view.games[0];
  assert.equal(tetris.core, 'other');
  assert.deepEqual(tetris.versions.map((v) => v.key), ['46df91ad', 'aaaaaaaa']);
  assert.equal(tetris.versions[0].platform, 'gb');
  assert.deepEqual(tetris.mods.map((m) => [m.name, m.status]), [['Alien', 'mismatch'], ['Ips', 'unverified'], ['Turbo', 'verified']]);
  assert.equal(versionForMod(tetris.mods[2], tetris).crc, '46DF91AD');
  assert.equal(versionForMod(tetris.mods[1], tetris), tetris.versions[0]);
  assert.equal(modStatus({ fits: 'X' }), 'verified');
});

test('the Neo Geo BIOS is not a game', () => {
  const neo = { version: 1, system: 'NEOGEO', games: { neogeo: { title: 'Neo Geo', versions: [{ path: 'NEOGEO/neogeo.zip', crc: '11111111' }], mods: [] }, mslug: { title: 'Metal Slug', versions: [{ path: 'NEOGEO/mslug.zip', crc: '22222222' }], mods: [] } } };
  const view = gamesOf('neogeo', [neo]);
  assert.deepEqual(view.games.map((g) => g.id), ['mslug']);
  assert.deepEqual(view.bios, { path: 'NEOGEO/neogeo.zip', crc: '11111111' });
});

test('the play link is the one rom-manager builds', async () => {
  const { playQuery } = await import('../src/helpers/library-view.js');
  assert.equal(playQuery({ rmSystem: 'GAMEBOY', gameId: 'tetris', version: '46DF91AD', patch: 'E1DE477B59' }), 'system=GAMEBOY&game=tetris&version=46df91ad&patch=e1de477b');
  assert.equal(playQuery({ gameId: 'x', version: 'abc' }), 'game=x&version=abc');
});
