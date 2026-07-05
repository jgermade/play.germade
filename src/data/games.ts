export type GameStatus = "ready" | "wip" | "broken";
export type GameCategory = "Juegos Previstos" | "Consolas Retro";

export interface GameEntry {
  slug: string;
  title: string;
  emoji: string;
  description: string;
  status: GameStatus;
  category: GameCategory;
  coverUrl?: string;
  bannerUrl?: string;
  youtubeId?: string;
}

export const gamesData: GameEntry[] = [
  {
    slug: "celeste",
    title: "Celeste/Everest",
    emoji: "🏔️",
    description:
      "A tight, hand-crafted platformer about climbing a mountain. Includes the Everest mod loader.",
    status: "ready",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/celeste_vertical.png",
    bannerUrl: "/assets/covers/celeste_bg.png",
    youtubeId: "ioGvtPMX5s0"
  },
  {
    slug: "megadrive-emu",
    title: "SEGA Megadrive",
    emoji: "🦔",
    description: "Sega Megadrive / Genesis emulator core. Plays .md and .gen roms.",
    status: "wip",
    category: "Consolas Retro",
  },
  {
    slug: "sonic-1",
    title: "Sonic The Hedgehog",
    emoji: "🌀",
    description: "Sonic 1 decompilation, running via WASM.",
    status: "ready",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/sonic_cover.png",
    youtubeId: "8v4Cg2nE0R4"
  },
  {
    slug: "sonic-2",
    title: "Sonic The Hedgehog 2",
    emoji: "⚡",
    description: "Sonic 2 decompilation, running via WASM.",
    status: "ready",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/sonic2_cover.png",
    youtubeId: "8v4Cg2nE0R4"
  },
  {
    slug: "sonic-3",
    title: "Sonic The Hedgehog 3",
    emoji: "💎",
    description: "Sonic 3 A.I.R. (Angel Island Revisited), running via WASM.",
    status: "ready",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/sonic_cover.png",
    youtubeId: "8v4Cg2nE0R4"
  },
  {
    slug: "sonic-mania",
    title: "Sonic Mania",
    emoji: "🦔",
    description: "Sonic Mania decompilation, running via WASM.",
    status: "ready",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/sonic_cover.png",
    youtubeId: "8v4Cg2nE0R4"
  },
  {
    slug: "quake",
    title: "Quake (Qwasm)",
    emoji: "🔨",
    description: "Classic Quake, ported to the web with Qwasm.",
    status: "wip",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/quake_cover.png",
    youtubeId: "z_u4C73_aBc"
  },
  {
    slug: "quake-2",
    title: "Quake II (Qwasm2)",
    emoji: "👿",
    description: "Quake II, ported to the web with Qwasm2.",
    status: "wip",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/quake_cover.png",
    youtubeId: "z_u4C73_aBc"
  },
  {
    slug: "doom",
    title: "Doom (Dwasm)",
    emoji: "🔫",
    description: "The original DOOM, ported to run in your browser.",
    status: "wip",
    category: "Juegos Previstos",
    coverUrl: "/assets/covers/quake_cover.png",
    youtubeId: "1m1V8z-zKmw"
  }
];
