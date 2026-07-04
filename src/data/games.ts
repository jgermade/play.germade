export type GameStatus = "ready" | "wip" | "broken";

export interface GameEntry {
  slug: string;
  title: string;
  emoji: string;
  description: string;
  status: GameStatus;
}

export const gamesData: GameEntry[] = [
  {
    slug: "celeste",
    title: "Celeste/Everest",
    emoji: "🏔️",
    description: "Configured launcher for Celeste/Everest in the browser.",
    status: "ready"
  },
  {
    slug: "sonic-1",
    title: "Sonic The Hedgehog",
    emoji: "🌀",
    description: "Sonic 1 decompilation, running via WASM.",
    status: "wip"
  },
  {
    slug: "sonic-2",
    title: "Sonic The Hedgehog 2",
    emoji: "⚡",
    description: "Sonic 2 decompilation, running via WASM.",
    status: "wip"
  },
  {
    slug: "sonic-3",
    title: "Sonic The Hedgehog 3",
    emoji: "💎",
    description: "Sonic 3 decompilation, running via WASM.",
    status: "wip"
  },
  {
    slug: "sonic-mania",
    title: "Sonic Mania",
    emoji: "🦔",
    description: "Sonic Mania decompilation, running via WASM.",
    status: "wip"
  },
  {
    slug: "quake",
    title: "Quake (Qwasm)",
    emoji: "🔨",
    description: "Classic Quake, ported to the web with Qwasm.",
    status: "wip"
  },
  {
    slug: "quake-2",
    title: "Quake II (Qwasm2)",
    emoji: "👿",
    description: "Quake II, ported to the web with Qwasm2.",
    status: "wip"
  },
  {
    slug: "doom",
    title: "Doom (Dwasm)",
    emoji: "🔫",
    description: "The original DOOM, ported to run in your browser.",
    status: "wip"
  }
];
