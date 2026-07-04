const gamesData = [
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

function getStatusHTML(status) {
  switch (status) {
    case "ready": return `<span class="status-tag status-ready">● Ready</span>`;
    case "wip": return `<span class="status-tag status-wip">● WIP</span>`;
    case "broken": return `<span class="status-tag status-broken">● Broken</span>`;
    default: return ``;
  }
}

const container = document.getElementById('games-grid');

gamesData.forEach(game => {
  const playAction = game.status === "ready"
    ? `<a href="game/${game.slug}/index.html" class="btn btn-primary">🕹️ Play</a>`
    : `<button class="btn btn-primary" disabled>🕹️ Play</button>`;

  const detailsAction = game.status === "ready"
    ? `<a href="game/${game.slug}/index.html#setup" class="btn btn-secondary">📖 Details</a>`
    : `<button class="btn btn-secondary" disabled>📖 Details</button>`;

  const card = document.createElement('article');
  card.classList.add('game-card');
  card.innerHTML = `
    <div class="card-cover-default">${game.emoji}</div>
    <div class="card-content">
      <h2 class="card-title">${game.title}</h2>
      <div class="card-meta">${getStatusHTML(game.status)}</div>
      <p class="card-description">${game.description}</p>
      <div class="card-actions">
        ${playAction}
        ${detailsAction}
      </div>
    </div>
  `;
  container.appendChild(card);
});
