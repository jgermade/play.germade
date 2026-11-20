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
//
// What a player reads (category titles, descriptions, kickers, file labels) is `{ en, es }`,
// shown through i18n.service.js `tx()`. Game and system names stay as they are called.

export const CATEGORIES = [
  {
    id: 'retro-moderno',
    title: { en: 'Modern retro', es: 'Retro moderno' },
    subtitle: {
      en: 'Classics rebuilt: decompilations and native ports to WebAssembly',
      es: 'Clásicos reconstruidos: decompilaciones y ports nativos a WebAssembly',
    },
  },
  {
    id: 'emuladores',
    title: { en: 'Emulators', es: 'Emuladores' },
    subtitle: { en: 'Whole systems, each with its own ROM library', es: 'Sistemas completos. Cada uno con su propia biblioteca de ROMs' },
  },
];

/** @typedef {'ready' | 'soon'} Status */

export const GAMES = [
  {
    slug: 'celeste',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Celeste',
    year: 2018,
    description: {
      en: 'Celeste on the .NET WebAssembly runtime, with Everest. It comes after the RSDK engines.',
      es: 'Celeste sobre el runtime .NET WebAssembly, con Everest. Llega tras los motores RSDK.',
    },
    engine: 'celeste',
    status: 'soon',
    cover: '/assets/covers/celeste_cover.jpg',
    banner: '/assets/covers/celeste_bg.png',
    accent: '#be185d',
  },
  {
    slug: 'sonic1',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic the Hedgehog',
    year: 1991,
    description: {
      en: 'The RSDKv4 decompilation of the 2013 release. One engine for Sonic 1 and Sonic 2: the Data.rsdk you bring picks the game.',
      es: 'La decompilación de RSDKv4 de la versión de 2013. Un único motor para Sonic 1 y Sonic 2: lo que elige el juego es el Data.rsdk que aportas.',
    },
    engine: 'rsdkv4',
    status: 'ready',
    cover: '/assets/covers/sonic_cover.jpg',
    accent: '#1d4ed8',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: { en: 'Sonic 1’s Data.rsdk', es: 'Data.rsdk de Sonic 1' } },
    },
  },
  {
    slug: 'sonic2',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic the Hedgehog 2',
    year: 1992,
    description: {
      en: 'The same RSDKv4 engine as Sonic 1, another Data.rsdk. Saves are kept apart, in its own folder.',
      es: 'Mismo motor RSDKv4 que Sonic 1, otro Data.rsdk. Partidas guardadas por separado en su propia carpeta.',
    },
    engine: 'rsdkv4',
    status: 'ready',
    cover: '/assets/covers/sonic2_cover.jpg',
    accent: '#0e7490',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: { en: 'Sonic 2’s Data.rsdk', es: 'Data.rsdk de Sonic 2' } },
    },
  },
  {
    slug: 'soniccd',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic CD',
    year: 1993,
    description: {
      en: 'The RSDKv3 decompilation of the 2011 release, with its own menus and its Stage Select at hand from the pause menu. You bring the Data.rsdk.',
      es: 'La decompilación de RSDKv3 de la versión de 2011, con sus propios menús y su Stage Select a mano desde la pausa. El Data.rsdk lo aportas tú.',
    },
    engine: 'rsdkv3',
    status: 'ready',
    cover: '/assets/covers/soniccd_cover.jpg',
    accent: '#7c3aed',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: { en: 'Sonic CD’s Data.rsdk', es: 'Data.rsdk de Sonic CD' } },
    },
  },
  {
    slug: 'sonic3air',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic 3 A.I.R.',
    year: 1994,
    description: {
      en: 'Sonic 3 & Knuckles in Angel Island Revisited, Eukaryot’s remaster: widescreen, every character and its mods. You bring the Sonic 3 & Knuckles ROM.',
      es: 'Sonic 3 & Knuckles en Angel Island Revisited, el remaster de Eukaryot: pantalla ancha, todos los personajes y sus mods. La ROM de Sonic 3 & Knuckles la aportas tú.',
    },
    engine: 'sonic3air',
    status: 'ready',
    // The ROM of the Steam release (or a Mega Drive dump of the lock-on), and optionally the
    // remastered soundtrack: the engine's `rom` and `audioremaster` assets.
    install: {
      rom: {
        file: 'Sonic_Knuckles_wSonic3.bin',
        accept: ['.bin'],
        label: { en: 'Sonic & Knuckles + Sonic 3 ROM', es: 'ROM de Sonic & Knuckles + Sonic 3' },
      },
      audioremaster: {
        file: 'audioremaster.bin',
        accept: ['.bin'],
        label: { en: 'Remastered soundtrack', es: 'Banda sonora remasterizada' },
        optional: true,
      },
    },
    cover: '/assets/covers/sonic3air_cover.jpg',
    accent: '#2563eb',
  },
  {
    slug: 'sonicmania',
    category: 'retro-moderno',
    kind: 'game',
    title: 'Sonic Mania',
    year: 2017,
    description: {
      en: 'The RSDKv5U decompilation, with its own menus: saves, character and modes as always, and the Stage Select from the pause menu. You bring the Data.rsdk.',
      es: 'La decompilación de RSDKv5U, con sus propios menús: partidas, personaje y modos como siempre, y el Stage Select desde la pausa. El Data.rsdk lo aportas tú.',
    },
    engine: 'rsdkv5',
    status: 'ready',
    cover: '/assets/covers/sonicmania_cover.jpg',
    accent: '#db2777',
    install: {
      data: { file: 'Data.rsdk', accept: ['.rsdk'], label: { en: 'Sonic Mania’s Data.rsdk', es: 'Data.rsdk de Sonic Mania' } },
    },
  },
  {
    slug: 'neogeo',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Neo Geo',
    description: {
      en: 'The Neo Geo AES, SNK’s home console, with FinalBurn Neo: your games as .zip (FBNeo sets) and the neogeo.zip BIOS. Saves on a memory card, one per game.',
      es: 'La Neo Geo AES, la consola doméstica de SNK, con FinalBurn Neo: tus juegos en .zip (sets de FBNeo) y la BIOS neogeo.zip. Partidas en tarjeta de memoria, una por juego.',
    },
    system: 'neogeo',
    engine: 'fbneo',
    // The AES, not the arcade board: the engine boots the console BIOS and a memory card.
    options: { neogeo: 'aes' },
    bios: { file: 'neogeo.zip', label: { en: 'Neo Geo BIOS (neogeo.zip)', es: 'BIOS de Neo Geo (neogeo.zip)' } },
    accept: ['.zip', '.neo'],
    status: 'ready',
    accent: '#b45309',
    art: '/art/systems/arcade.svg',
    tileArt: '/art/systems/tiles/arcade.svg',
    kicker: 'SNK · AES',
    boxart: '3 / 4', // the box's aspect ratio (width / height), as ROM Manager's systemAspectRatio()
  },
  {
    slug: 'megadrive',
    category: 'emuladores',
    kind: 'emulator',
    title: 'Mega Drive',
    description: {
      en: 'Sega Mega Drive / Genesis. Your ROM library, grouped by game and version.',
      es: 'Sega Mega Drive / Genesis. Tu biblioteca de ROMs, agrupada por juego y versión.',
    },
    system: 'megadrive',
    engine: 'blastem', // default core; the console and each game can choose another
    cores: [
      { id: 'blastem', label: 'BlastEm' },
      { id: 'jgenesis', label: 'jgenesis', needs: ['webgpu'] },
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
    description: {
      en: 'Super Nintendo / Super Famicom. Your ROM library, grouped by game and version.',
      es: 'Super Nintendo / Super Famicom. Tu biblioteca de ROMs, agrupada por juego y versión.',
    },
    system: 'snes',
    engine: 'snes9x', // default core; the console and each game can choose another
    cores: [
      { id: 'snes9x', label: 'Snes9x' },
      { id: 'jgenesis', label: 'jgenesis', needs: ['webgpu'] },
    ],
    accept: ['.sfc', '.smc', '.fig', '.swc', '.zip'],
    status: 'ready',
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
    description: {
      en: 'GBA, Game Boy Color and Game Boy with mGBA. Your ROM library, grouped by game and version.',
      es: 'GBA, Game Boy Color y Game Boy con mGBA. Tu biblioteca de ROMs, agrupada por juego y versión.',
    },
    system: 'gba', // one library for the three handhelds; each cart gets its own on-screen pad
    engine: 'mgba',
    cores: [{ id: 'mgba', label: 'mGBA' }],
    accept: ['.gba', '.agb', '.gb', '.gbc', '.sgb', '.cgb', '.zip'],
    status: 'ready',
    accent: '#3730a3',
    art: '/art/systems/gba.svg',
    tileArt: '/art/systems/tiles/gba.svg',
    kicker: { en: 'Handheld · 32 bits', es: 'Portátil · 32 bits' },
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
