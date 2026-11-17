// Which cores of a catalog entry this browser can run.
//
// A core may need a browser feature (jgenesis renders with WebGPU). Without it, the core is
// listed but unavailable, with the reason, and a console or game that chose it plays on the
// entry's default core instead.

/**
 * @param {Array<{ id: string, label: string, available?: boolean, needs?: string[] }>} cores
 * @param {Record<string, boolean>} features what the browser has, e.g. `{ webgpu: true }`
 * @returns the same cores, each with `available` and, when false for a missing feature, `missing`
 */
export function resolveCores(cores = [], features = {}) {
  return cores.map((core) => {
    if (core.available === false) return core;
    const missing = (core.needs ?? []).find((need) => !features[need]);
    return missing ? { ...core, available: false, missing } : { ...core, available: true };
  });
}

/** The core to run: the chosen one when this browser can, else the fallback. */
export function playableCore(cores, chosen, fallback) {
  if (!chosen) return fallback;
  const core = cores.find((c) => c.id === chosen);
  return core && core.available === false ? fallback : chosen;
}
