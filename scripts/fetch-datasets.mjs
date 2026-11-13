// ROM Manager's datasets → public/datasets/<system>.json, slimmed for the browser.
//
//   node scripts/fetch-datasets.mjs                       from GitHub, at the pinned commit
//   DATASETS_SRC=../rom-manager node scripts/fetch-datasets.mjs   from a local checkout
//
// The slim file keeps what identification and covers need:
//   roms:   [[crc, size, name, boxart]]   one per DAT entry (boxart: file name or "")
//   covers: { title: { EU?, US?, JP? } }  game-level boxarts, keyed by normalized title
//   boxarts: base URL the file names hang off (libretro-thumbnails, Named_Boxarts)
// A failed download keeps the previous file, so an offline build still has data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'src/data/datasets.json'), 'utf8'));
const out = join(root, 'public/datasets');
const local = process.env.DATASETS_SRC;
mkdirSync(out, { recursive: true });

async function read(folder) {
  if (local) return JSON.parse(readFileSync(join(resolve(local), 'static/datasets', folder, 'dataset.json'), 'utf8'));
  const url = `https://raw.githubusercontent.com/${config.repo}/${config.commit}/static/datasets/${folder}/dataset.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

const baseOf = (url) => url.slice(0, url.lastIndexOf('/') + 1);

for (const [system, folder] of Object.entries(config.systems)) {
  const file = join(out, `${system}.json`);
  let data;
  try {
    data = await read(folder);
  } catch (error) {
    if (existsSync(file)) {
      console.warn(`datasets: ${system}: ${error.message} — keeping the previous file`);
      continue;
    }
    console.warn(`datasets: ${system}: ${error.message} — no dataset, identification falls back to headers`);
    continue;
  }
  const anyCover = data.list.find((e) => e.cover)?.cover ?? Object.values(data.covers ?? {}).flatMap(Object.values)[0];
  const boxarts = anyCover ? baseOf(anyCover) : '';
  const strip = (url) => (url && url.startsWith(boxarts) ? url.slice(boxarts.length) : url ?? '');
  const slim = {
    source: { repo: config.repo, commit: local ? 'local' : config.commit, folder, generated: data.meta?.generated ?? null },
    boxarts,
    roms: data.list.map((e) => [e.crc.toUpperCase(), e.size ?? 0, e.name, strip(e.cover)]),
    covers: Object.fromEntries(
      Object.entries(data.covers ?? {}).map(([title, byRegion]) => [
        title,
        Object.fromEntries(Object.entries(byRegion).map(([region, url]) => [region, strip(url)])),
      ]),
    ),
  };
  writeFileSync(file, JSON.stringify(slim));
  console.log(`datasets: ${system} ← ${folder} (${slim.roms.length} ROMs, ${Object.keys(slim.covers).length} games with boxarts)`);
}
