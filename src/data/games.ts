export type GameStatus = "ready" | "wip" | "broken";
export type GameCategory = "Featured" | "Platformers" | "Shooters" | "Sonic Collection";

export interface GameEntry {
  slug: string;
  title: string;
  emoji: string;
  description: string;
  status: GameStatus;
  category: GameCategory;
  coverUrl?: string;
  bannerUrl?: string;
}

export const gamesData: GameEntry[] = [
  {
    slug: "celeste",
    title: "Celeste/Everest",
    emoji: "🏔️",
    description: "Configured launcher for Celeste/Everest in the browser.",
    status: "ready",
    category: "Featured",
    coverUrl: "/covers/celeste_banner.png",
    bannerUrl: "/covers/celeste_banner.png"
  },
  {
    slug: "sonic-1",
    title: "Sonic The Hedgehog",
    emoji: "🌀",
    description: "Sonic 1 decompilation, running via WASM.",
    status: "wip",
    category: "Sonic Collection",
    coverUrl: "/covers/sonic_cover.png"
  },
  {
    slug: "sonic-2",
    title: "Sonic The Hedgehog 2",
    emoji: "⚡",
    description: "Sonic 2 decompilation, running via WASM.",
    status: "wip",
    category: "Sonic Collection",
    coverUrl: "/covers/sonic_cover.png"
  },
  {
    slug: "sonic-3",
    title: "Sonic The Hedgehog 3",
    emoji: "💎",
    description: "Sonic 3 decompilation, running via WASM.",
    status: "wip",
    category: "Sonic Collection",
    coverUrl: "/covers/sonic_cover.png"
  },
  {
    slug: "sonic-mania",
    title: "Sonic Mania",
    emoji: "🦔",
    description: "Sonic Mania decompilation, running via WASM.",
    status: "wip",
    category: "Sonic Collection",
    coverUrl: "/covers/sonic_cover.png"
  },
  {
    slug: "quake",
    title: "Quake (Qwasm)",
    emoji: "🔨",
    description: "Classic Quake, ported to the web with Qwasm.",
    status: "wip",
    category: "Shooters",
    coverUrl: "/covers/quake_cover.png"
  },
  {
    slug: "quake-2",
    title: "Quake II (Qwasm2)",
    emoji: "👿",
    description: "Quake II, ported to the web with Qwasm2.",
    status: "wip",
    category: "Shooters",
    coverUrl: "/covers/quake_cover.png"
  },
  {
    slug: "doom",
    title: "Doom (Dwasm)",
    emoji: "🔫",
    description: "The original DOOM, ported to run in your browser.",
    status: "wip",
    category: "Shooters",
    coverUrl: "/covers/quake_cover.png"
  }
];
