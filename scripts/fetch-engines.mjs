#!/usr/bin/env node
// Put every engine the catalog plays into public/engines/<id>/, pinned.
//
// Each engine repo works on its own and publishes its build as a GitHub Release
// asset (the npm package carries the SDK but not the .wasm). This downloads the
// pinned asset, extracts it and copies the engine folder — SDK, contract runtime,
// Emscripten glue and wasm — so the launcher serves them same-origin, which the
// service worker can cache and cross-origin isolation requires.
//
//   node scripts/fetch-engines.mjs                 # all engines in src/data/engines.json
//   ENGINE_SRC_RSDKV4=../rsdkv4-wasm/dist/rsdkv4 node scripts/fetch-engines.mjs
//
// A folder already holding the pinned version (public/engines/<id>/.version) is
// left alone, so `npm run dev` stays fast after the first run.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const engines = JSON.parse(readFileSync(join(root, 'src/data/engines.json'), 'utf8'));
const out = join(root, 'public/engines');

const die = (message) => {
  console.error(`fetch-engines: ${message}`);
  process.exit(1);
};

for (const [id, engine] of Object.entries(engines)) {
  if (id.startsWith('$')) continue;
  const dest = join(out, id);
  const local = process.env[`ENGINE_SRC_${id.toUpperCase()}`];
  const stamp = local ? `local:${resolve(local)}` : engine.version;
  const stampFile = join(dest, '.version');

  if (!local && existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) {
    console.log(`fetch-engines: ${id}@${engine.version} already in place`);
    continue;
  }

  // Assemble in a staging folder and swap it in only once it is complete, so a
  // failed download never leaves an engine half-replaced or gone.
  const staging = mkdtempSync(join(tmpdir(), `engine-${id}-`));
  const ready = join(staging, 'engine');

  if (local) {
    if (!existsSync(join(local, engine.entry))) die(`${local} has no ${engine.entry}`);
    cpSync(local, ready, { recursive: true });
  } else {
    const url = `https://github.com/${engine.repo}/releases/download/v${engine.version}/${engine.asset}`;
    const archive = join(staging, engine.asset);
    console.log(`fetch-engines: ${id}@${engine.version} ← ${url}`);
    const res = await fetch(url);
    if (!res.ok) die(`${url} answered ${res.status} — is v${engine.version} released? (ENGINE_SRC_${id.toUpperCase()}=<dir> uses a local build)`);
    writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    execFileSync('tar', ['-xzf', archive, '-C', staging]);
    const from = join(staging, engine.path);
    if (!existsSync(join(from, engine.entry))) die(`${engine.asset} has no ${engine.path}/${engine.entry}`);
    cpSync(from, ready, { recursive: true });
  }

  for (const file of [engine.entry, 'engine-specs.js', ...(engine.app ? [engine.app] : [])]) {
    if (!existsSync(join(ready, file))) die(`${id}: ${file} missing — the engine must ship a self-contained SDK`);
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(ready, dest, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  writeFileSync(stampFile, stamp);
  console.log(`fetch-engines: ${id} → public/engines/${id}/ (${stamp})`);
}
