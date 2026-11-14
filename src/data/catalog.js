// The launcher's catalog: data only. A new game is an entry here; a new engine is
// an entry in engines.json plus entries here — never a new page.
//
// `kind` decides what a card opens:
//   'game'     — a modern retro game on a decompiled/ported engine: install its data
//                once, then play. Storage is the engine's own `<engine>/<slug>/`.
// Art: `cover` (a poster image), else `art` (a system illustration), else the card
// draws a typographic poster from the title — never an emoji. Systems carry `boxart`,
// the shape of their games' boxes: the ROM tiles take it, cover or not.
//
//   'emulator' — a system: opens its ROM list (one entry per game, versions grouped,
//                optional ROM-hack patches applied while loading). See RECORD/.
//
// `install` lists the files a game needs, keyed by the engine's asset name. Each is
// staged once into OPFS `<engine>/<slug>/<file>` and handed to the engine as a thunk
// that reads it back, so the engine never downloads or copies it twice.

export const CATEGORIES = [
  {
    id: 'retro-moderno',
    title: 'Retro moderno',
    subtitle: 'Clásicos reconstruidos: decompilaciones y ports nativos a WebAssembly',
  },
  {
    id: 'emuladores',
    title: 'Emuladores',
    subtitle: 'Sistemas completos. Cada uno con su propia biblioteca de ROMs',
  },
];

/** @typedef {'ready' | 'soon'} Status */

export const GAMES = [
  {
    slug: 'sonic1',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic the Hedgehog',
    year: 1991,
    description:
      'La decompilación de RSDKv4 de la versión de 2013. Un único motor para Sonic 1 y Sonic 2: lo que elige el juego es el Data.rsdk que aportas.',
    engine: 'rsdkv4',
    status: 'ready',
    cover: '/assets/covers/sonic_cover.png',
    accent: '#1d4ed8',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: 'Data.rsdk de Sonic 1' },
    },
  },
  {
    slug: 'sonic2',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic the Hedgehog 2',
    year: 1992,
    description:
      'Mismo motor RSDKv4 que Sonic 1, otro Data.rsdk. Partidas guardadas por separado en su propia carpeta.',
    engine: 'rsdkv4',
    status: 'ready',
    cover: '/assets/covers/sonic2_cover.png',
    accent: '#0e7490',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: 'Data.rsdk de Sonic 2' },
    },
  },
  {
    slug: 'soniccd',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic CD',
    year: 1993,
    description: 'RSDKv3. Llega cuando rsdkv3-wasm pase al contrato 1.0.',
    engine: 'rsdkv3',
    status: 'soon',
    accent: '#7c3aed',
  },
  {
    slug: 'sonicmania',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic Mania',
    year: 2017,
    description:
      'La decompilación de RSDKv5U, con la pantalla de partidas de siempre: ocho huecos, tu personaje y donde lo dejaste. El Data.rsdk lo aportas tú.',
    engine: 'rsdkv5',
    status: 'ready',
    accent: '#db2777',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: 'Data.rsdk de Sonic Mania' },
    },
  },
  {
    slug: 'celeste',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Celeste',
    year: 2018,
    description: 'Celeste sobre el runtime .NET WebAssembly, con Everest. Llega tras los motores RSDK.',
    engine: 'celeste',
    status: 'soon',
    cover: '/assets/covers/celeste_vertical.png',
    banner: '/assets/covers/celeste_bg.png',
    accent: '#be185d',
  },
  {
    slug: 'neogeo',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Neo Geo',
    description: 'Arcade y AES/MVS con FinalBurn Neo. ROMs en .zip y BIOS neogeo.zip.',
    engine: 'fbneo',
    status: 'soon',
    accent: '#b45309',
    art: '/art/systems/arcade.svg',
    tileArt: '/art/systems/tiles/arcade.svg',
    kicker: 'Arcade · SNK',
    boxart: '3 / 4', // the box's aspect ratio (width / height), as ROM Manager's systemAspectRatio()
  },
  {
    slug: 'megadrive',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Mega Drive',
    description: 'Sega Mega Drive / Genesis. Tu biblioteca de ROMs, agrupada por juego y versión.',
    system: 'megadrive',
    engine: 'blastem', // default core; the console and each game can choose another
    cores: [
      { id: 'blastem', label: 'BlastEm' },
      { id: 'jgenesis', label: 'jgenesis', available: false },
    ],
    accept: ['.bin', '.gen', '.md', '.smd', '.zip'],
    status: 'ready',
    accent: '#9f1239',
    art: '/art/systems/mega-drive.svg',
    tileArt: '/art/systems/tiles/mega-drive.svg',
    kicker: 'Sega · 16 bits',
    boxart: '3 / 4', // the box's aspect ratio (width / height), as ROM Manager's systemAspectRatio()
  },
  {
    slug: 'snes',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Super Nintendo',
    description: 'Super Nintendo / Super Famicom.',
    engine: 'jgenesis',
    status: 'soon',
    accent: '#4c1d95',
    art: '/art/systems/snes.svg',
    tileArt: '/art/systems/tiles/snes.svg',
    kicker: 'Nintendo · 16 bits',
    boxart: '4 / 3', // the box's aspect ratio (width / height), as ROM Manager's systemAspectRatio()
  },
  {
    slug: 'gba',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Game Boy Advance',
    description: 'GBA, Game Boy Color y Game Boy con mGBA.',
    engine: 'mgba',
    status: 'soon',
    accent: '#3730a3',
    art: '/art/systems/gba.svg',
    tileArt: '/art/systems/tiles/gba.svg',
    kicker: 'Portátil · 32 bits',
    boxart: '4 / 3', // the box's aspect ratio (width / height), as ROM Manager's systemAspectRatio()
  },
];

/** The page for an entry: `/<slug>/` (systems take `?game=…&version=…&patch=…`). */
export const routeOf = (entry) => `/${entry.slug}/`;

export const gameBySlug = (slug) => GAMES.find((game) => game.slug === slug) ?? null;

export const rows = () =>
  CATEGORIES.map((category) => ({
    ...category,
    games: GAMES.filter((game) => game.category === category.id),
  })).filter((row) => row.games.length > 0);
