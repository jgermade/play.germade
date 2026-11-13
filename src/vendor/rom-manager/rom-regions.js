// Vendored from wasm-gaming/rom-manager@d23406e5796bc5137c12b7c6feb97aef17adf684 src/core/rom-regions.ts (pure, no deps),
// transpiled to JS with esbuild. Do not edit here: update the commit and re-vendor.

const ANY_REGION = "*";
function isRegion(value) {
  return value === "EU" || value === "US" || value === "JP";
}
const REGIONS = ["EU", "US", "JP"];
const STANDARD_ORDER = ["PAL", "NTSC"];
const DAT_REGIONS = /* @__PURE__ */ new Map([
  // Europe, and the countries that took the European release
  ["Europe", { region: "EU", video: "PAL" }],
  ["Austria", { region: "EU", video: "PAL" }],
  ["Belgium", { region: "EU", video: "PAL" }],
  ["Bulgaria", { region: "EU", video: "PAL" }],
  ["Croatia", { region: "EU", video: "PAL" }],
  ["Czech", { region: "EU", video: "PAL" }],
  ["Denmark", { region: "EU", video: "PAL" }],
  ["Estonia", { region: "EU", video: "PAL" }],
  ["Finland", { region: "EU", video: "PAL" }],
  ["France", { region: "EU", video: "PAL" }],
  ["Germany", { region: "EU", video: "PAL" }],
  ["Greece", { region: "EU", video: "PAL" }],
  ["Hungary", { region: "EU", video: "PAL" }],
  ["Ireland", { region: "EU", video: "PAL" }],
  ["Italy", { region: "EU", video: "PAL" }],
  ["Latvia", { region: "EU", video: "PAL" }],
  ["Lithuania", { region: "EU", video: "PAL" }],
  ["Netherlands", { region: "EU", video: "PAL" }],
  ["Norway", { region: "EU", video: "PAL" }],
  ["Poland", { region: "EU", video: "PAL" }],
  ["Portugal", { region: "EU", video: "PAL" }],
  ["Romania", { region: "EU", video: "PAL" }],
  ["Russia", { region: "EU", video: "PAL" }],
  ["Scandinavia", { region: "EU", video: "PAL" }],
  ["Serbia", { region: "EU", video: "PAL" }],
  ["Slovakia", { region: "EU", video: "PAL" }],
  ["Slovenia", { region: "EU", video: "PAL" }],
  ["Spain", { region: "EU", video: "PAL" }],
  ["Sweden", { region: "EU", video: "PAL" }],
  ["Switzerland", { region: "EU", video: "PAL" }],
  ["Turkey", { region: "EU", video: "PAL" }],
  ["UK", { region: "EU", video: "PAL" }],
  ["Ukraine", { region: "EU", video: "PAL" }],
  ["United Kingdom", { region: "EU", video: "PAL" }],
  // PAL territories served by the European release rather than by one of their own
  ["Australia", { region: "EU", video: "PAL" }],
  ["New Zealand", { region: "EU", video: "PAL" }],
  ["India", { region: "EU", video: "PAL" }],
  ["Israel", { region: "EU", video: "PAL" }],
  ["South Africa", { region: "EU", video: "PAL" }],
  // The Americas
  ["USA", { region: "US", video: "NTSC" }],
  ["Canada", { region: "US", video: "NTSC" }],
  ["Mexico", { region: "US", video: "NTSC" }],
  ["Chile", { region: "US", video: "NTSC" }],
  ["Peru", { region: "US", video: "NTSC" }],
  ["Latin America", { region: "US", video: "NTSC" }],
  // PAL-M is 60 Hz, so a Brazilian build runs like an NTSC one.
  ["Brazil", { region: "US", video: "NTSC" }],
  // PAL-N is 50 Hz, so an Argentinian build does not.
  ["Argentina", { region: "US", video: "PAL" }],
  // Japan and the territories that took the Japanese release
  ["Japan", { region: "JP", video: "NTSC" }],
  ["Asia", { region: "JP", video: "NTSC" }],
  ["China", { region: "JP", video: "NTSC" }],
  ["Hong Kong", { region: "JP", video: "NTSC" }],
  ["Korea", { region: "JP", video: "NTSC" }],
  ["Singapore", { region: "JP", video: "NTSC" }],
  ["Taiwan", { region: "JP", video: "NTSC" }],
  ["Thailand", { region: "JP", video: "NTSC" }]
]);
const WORLD = "World";
function regionsOf(datRegions) {
  const found = /* @__PURE__ */ new Set();
  for (const name of datRegions) {
    if (name === WORLD) {
      for (const region of REGIONS) found.add(region);
      continue;
    }
    const known = DAT_REGIONS.get(name);
    if (known) found.add(known.region);
  }
  return REGIONS.filter((region) => found.has(region));
}
function videoStandardsOf(datRegions) {
  const found = /* @__PURE__ */ new Set();
  for (const name of datRegions) {
    if (name === WORLD) {
      for (const standard of STANDARD_ORDER) found.add(standard);
      continue;
    }
    const known = DAT_REGIONS.get(name);
    if (known) found.add(known.video);
  }
  return STANDARD_ORDER.filter((standard) => found.has(standard));
}
const REGION_ORDERS = [
  ["EU", "US", "JP"],
  ["US", "EU", "JP"],
  ["EU", "JP", "US"],
  ["US", "JP", "EU"],
  ["JP", "EU", "US"],
  ["JP", "US", "EU"]
];
const DEFAULT_REGION_ORDER = REGION_ORDERS[0];
function preferRegion(order, region) {
  return [region, ...order.filter((candidate) => candidate !== region)];
}
function regionOrderKey(order) {
  return order.join("/");
}
function parseRegionOrder(value) {
  const names = typeof value === "string" ? value.split("/") : value;
  if (!Array.isArray(names)) return DEFAULT_REGION_ORDER;
  const order = REGION_ORDERS.find(
    (candidate) => candidate.length === names.length && candidate.every((region, at) => region === names[at])
  );
  return order ?? DEFAULT_REGION_ORDER;
}
export {
  ANY_REGION,
  DEFAULT_REGION_ORDER,
  REGIONS,
  REGION_ORDERS,
  isRegion,
  parseRegionOrder,
  preferRegion,
  regionOrderKey,
  regionsOf,
  videoStandardsOf
};
