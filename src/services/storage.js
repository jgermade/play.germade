// OPFS access for the launcher, shared by the browse view and the player.
//
// Every engine owns `<engine-id>/` at the OPFS root (which is WASMFS `/data` inside
// the engine), and the launcher always uses the game's slug as the namespace — so a
// game's files live in `<engine>/<slug>/`, the same folder the engine reads and
// writes its saves to. `storagePath` here mirrors the engines' own: for a catalog
// slug (already clean) it is just the join.

export const storagePath = (engineId, slug) => `${engineId}/${slug}`;

export const opfsAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;

async function dirFor(path, create) {
  let dir = await navigator.storage.getDirectory();
  for (const segment of path.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

/** The file at `<path>/<name>`, or null when missing. */
export async function readFile(path, name) {
  if (!opfsAvailable()) return null;
  try {
    const dir = await dirFor(path, false);
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

export async function hasFile(path, name) {
  const file = await readFile(path, name);
  return !!file && file.size > 0;
}

/** Write a File/Blob into `<path>/<name>`, creating the folders. */
export async function writeFile(path, name, blob) {
  const dir = await dirFor(path, true);
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function removeFile(path, name) {
  try {
    const dir = await dirFor(path, false);
    await dir.removeEntry(name);
  } catch {
    /* already gone */
  }
}

/**
 * Ask the browser not to evict OPFS under storage pressure. Without it an installed
 * 40 MB game can silently disappear. Returns whether storage is persistent now.
 */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
