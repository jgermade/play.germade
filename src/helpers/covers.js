// The order in which a game's boxes are tried, as rom-manager's pickCover() does it:
// the regions the player owns (in the preferred order), then the other regions, and last
// the game-level box with no region — the `*` (World) box, which is the only box for many
// homebrew and `(World)` / `(USA, Europe)` releases.

export const REGIONS = ['EU', 'US', 'JP'];

/** The regions to try, preferred first: rom-manager's EU / US / JP switch. */
export const regionOrder = (preferred = 'EU') => [preferred, ...REGIONS.filter((r) => r !== preferred)];

/**
 * `[{ region, url }…]` to try in order; `region` is null for the World box.
 * `byRegion`: { EU?, US?, JP? } urls; `world`: the `*` url or null; `owned`: the player's regions.
 */
export function coverCandidates(byRegion, world, owned = [], preferred = 'EU') {
  const order = regionOrder(preferred);
  const mine = new Set(owned);
  const regions = [...order.filter((r) => mine.has(r)), ...order.filter((r) => !mine.has(r))];
  const out = regions.filter((r) => byRegion[r]).map((region) => ({ region, url: byRegion[region] }));
  if (world) out.push({ region: null, url: world });
  return out;
}
