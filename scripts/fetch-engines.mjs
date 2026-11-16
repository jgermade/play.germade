#!/usr/bin/env node
// Put every engine the catalog plays into public/engines/<id>/, pinned — and the tools
// served next to them (src/lib/tools.json: rom-manager at public/roms/).
//
// Each engine repo works on its own and publishes its build as a GitHub Release
// asset (the npm package carries the SDK but not the .wasm). This downloads the
// pinned asset, extracts it and copies the engine folder — SDK, contract runtime,
// Emscripten glue and wasm — so the launcher serves them same-origin, which the
// service worker can cache and cross-origin isolation requires.
//
//   node scripts/fetch-engines.mjs                 # all engines in src/lib/engines.json
//   ENGINE_SRC_RSDKV4=../rsdkv4-wasm/dist/rsdkv4 node scripts/fetch-engines.mjs
//
// A folder already holding the pinned version (public/engines/<id>/.version) is
// left alone, so `npm run dev` stays fast after the first run.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const engines = JSON.parse(readFileSync(join(root, 'src/lib/engines.json'), 'utf8'));
// Tools served next to the engines: rom-manager at /roms/ (its app and roms-sdk.js).
const tools = JSON.parse(readFileSync(join(root, 'src/lib/tools.json'), 'utf8'));
const out = join(root, 'public/engines');
const targets = [
  ...Object.entries(engines).map(([id, engine]) => [id, engine, join(out, id), `public/engines/${id}/`]),
  ...Object.entries(tools).map(([id, tool]) => [id, { ...tool, tool: true }, join(root, 'public', tool.dest ?? id), `public/${tool.dest ?? id}/`]),
];

const die = (message) => {
  console.error(`fetch-engines: ${message}`);
  process.exit(1);
};

for (const [id, engine, dest, shown] of targets) {
  if (id.startsWith('$')) continue;
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

  const required = engine.tool
    ? [engine.entry, ...(engine.requires ?? [])]
    : [engine.entry, 'engine-specs.js', ...(engine.app ? [engine.app] : [])];
  for (const file of required) {
    if (!existsSync(join(ready, file))) die(`${id}: ${file} missing — the release must ship it`);
  }

  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, '..'), { recursive: true });
  cpSync(ready, dest, { recursive: true });
  rmSync(staging, { recursive: true, force: true });
  writeFileSync(stampFile, stamp);
  console.log(`fetch-engines: ${id} → ${shown} (${stamp})`);
}
