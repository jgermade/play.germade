// Vendored from wasm-gaming/rom-manager@d23406e5796bc5137c12b7c6feb97aef17adf684 src/core/rom-grouping.ts (pure, no deps),
// transpiled to JS with esbuild. Do not edit here: update the commit and re-vendor.

import { regionsOf, videoStandardsOf } from './rom-regions.js';
const REGIONS = /* @__PURE__ */ new Set([
  "Argentina",
  "Asia",
  "Australia",
  "Austria",
  "Belgium",
  "Brazil",
  "Bulgaria",
  "Canada",
  "Chile",
  "China",
  "Croatia",
  "Czech",
  "Denmark",
  "Estonia",
  "Europe",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hong Kong",
  "Hungary",
  "India",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Korea",
  "Latin America",
  "Latvia",
  "Lithuania",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Peru",
  "Poland",
  "Portugal",
  "Romania",
  "Russia",
  "Scandinavia",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "Spain",
  "Sweden",
  "Switzerland",
  "Taiwan",
  "Thailand",
  "Turkey",
  "UK",
  "Ukraine",
  "United Kingdom",
  "Unknown",
  "USA",
  "World"
]);
const FLAGS = /* @__PURE__ */ new Set([
  "Beta",
  "Proto",
  "Prototype",
  "Demo",
  "Sample",
  "Unl",
  "Aftermarket",
  "Pirate",
  "Alt",
  "Debug",
  "Kiosk",
  "Program",
  "Test Program"
]);
const RESERVED_NAMES = /* @__PURE__ */ new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);
const MAX_NAME_LENGTH = 120;
const SLUG_LENGTH = 24;
const UNSAFE_CHARACTERS = /[&*/:`<>?\\|"]/g;
const ROMAN_NUMERAL_PATTERN = /\b(XXX|XXIX|XXVIII|XXVII|XXVI|XXV|XXIV|XXIII|XXII|XXI|XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II)\b/g;
const ROMAN_TO_ARABIC = {
  XXX: "30",
  XXIX: "29",
  XXVIII: "28",
  XXVII: "27",
  XXVI: "26",
  XXV: "25",
  XXIV: "24",
  XXIII: "23",
  XXII: "22",
  XXI: "21",
  XX: "20",
  XIX: "19",
  XVIII: "18",
  XVII: "17",
  XVI: "16",
  XV: "15",
  XIV: "14",
  XIII: "13",
  XII: "12",
  XI: "11",
  X: "10",
  IX: "9",
  VIII: "8",
  VII: "7",
  VI: "6",
  V: "5",
  IV: "4",
  III: "3",
  II: "2"
};
function normalizeRomanNumerals(text) {
  return text.replace(ROMAN_NUMERAL_PATTERN, (match) => ROMAN_TO_ARABIC[match] ?? match);
}
function sanitizeName(name) {
  return name.normalize("NFC").replace(UNSAFE_CHARACTERS, "_");
}
function splitTags(name) {
  const tags = [];
  let end = name.length;
  for (; ; ) {
    const head = name.slice(0, end).trimEnd();
    const close = head.length - 1;
    const opening = head[close] === ")" ? "(" : head[close] === "]" ? "[" : null;
    if (!opening) break;
    const open = head.lastIndexOf(opening, close);
    if (open <= 0 || !/\s/.test(head[open - 1])) break;
    tags.unshift(head.slice(open + 1, close).trim());
    end = open;
  }
  return { title: name.slice(0, end).trim(), tags: tags.filter(Boolean) };
}
function asLanguages(tag) {
  return /^[A-Z][a-z](,[A-Z][a-z])*$/.test(tag) ? tag.split(",") : null;
}
function asRegions(tag) {
  const parts = tag.split(", ");
  return parts.every((part) => REGIONS.has(part)) ? parts : null;
}
function asRevision(tag) {
  const revision = tag.match(/^Rev\s+([0-9A-Za-z.]+)$/);
  if (revision) return `rev${revision[1].replace(/\./g, "")}`;
  const version = tag.match(/^v([0-9][0-9A-Za-z.]*)$/);
  if (version) return `v${version[1].replace(/\./g, "")}`;
  return null;
}
function asFlag(tag) {
  const match = tag.match(/^([A-Za-z][A-Za-z ]*?)(?:\s+(\d+))?$/);
  if (!match || !FLAGS.has(match[1])) return null;
  return `${match[1].toLowerCase().replace(/ /g, "")}${match[2] ?? ""}`;
}
function asDisc(tag) {
  const match = tag.match(/^Disc\s+(\d+)(?:\s+of\s+\d+)?$/i);
  return match ? Number(match[1]) : null;
}
function parseGameName(name) {
  const { title, tags } = splitTags(name);
  const parsed = {
    title,
    regions: [],
    languages: [],
    flags: [],
    extras: [],
    tags
  };
  for (const tag of tags) {
    const regions = asRegions(tag);
    if (regions && parsed.regions.length === 0) {
      parsed.regions = regions;
      continue;
    }
    const languages = asLanguages(tag);
    if (languages && parsed.languages.length === 0) {
      parsed.languages = languages;
      continue;
    }
    const revision = asRevision(tag);
    if (revision && !parsed.revision) {
      parsed.revision = revision;
      continue;
    }
    const disc = asDisc(tag);
    if (disc !== null && parsed.disc === void 0) {
      parsed.disc = disc;
      continue;
    }
    const flag = asFlag(tag);
    if (flag) parsed.flags.push(flag);
    else parsed.extras.push(tag);
  }
  return parsed;
}
function normalizeGameName(name) {
  const { title } = splitTags(name);
  let normalized = sanitizeName(title).replace(/\s+/g, " ").trim();
  if (normalized.length > MAX_NAME_LENGTH) {
    const cut = normalized.slice(0, MAX_NAME_LENGTH);
    const boundary = cut.lastIndexOf(" ");
    normalized = (boundary > 0 ? cut.slice(0, boundary) : cut).trim();
  }
  normalized = normalized.replace(/[. ]+$/, "");
  if (RESERVED_NAMES.has(normalized.toUpperCase())) return `_${normalized}`;
  return normalized || "_";
}
function checksumSuffix(game) {
  return game.crc.toUpperCase().slice(0, 8);
}
function slug(tag) {
  const words = tag.toLowerCase().match(/[a-z0-9]+/g);
  if (!words) return "";
  let result = "";
  for (const word of words) {
    if (result.length + word.length > SLUG_LENGTH) break;
    result += word;
  }
  return result || words[0].slice(0, SLUG_LENGTH);
}
function variantKey(parsed, options = {}) {
  const parts = [parsed.regions.length > 0 ? parsed.regions.join("+") : "Unknown"];
  if (parsed.revision) parts.push(parsed.revision);
  parts.push(...parsed.flags);
  if (options.languages && parsed.languages.length > 0) parts.push(parsed.languages.join("+"));
  if (options.extras) parts.push(...parsed.extras.map(slug).filter(Boolean));
  if (options.checksum) parts.push(options.checksum);
  return parts.join("-");
}
function datRegionsOf(parsed, game) {
  if (parsed.regions.length > 0) return parsed.regions;
  return game.region ? [game.region] : [];
}
function releaseKey(parsed) {
  return [parsed.title, ...parsed.tags.filter((tag) => asDisc(tag) === null)].join("\0");
}
function byKey(drafts, options) {
  const buckets = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    const key = variantKey({ ...draft.parsed, regions: draft.regions }, options);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(draft);
    else buckets.set(key, [draft]);
  }
  return buckets;
}
function buildVariants(entries) {
  const drafts = /* @__PURE__ */ new Map();
  for (const { parsed, game } of entries) {
    const key = releaseKey(parsed);
    const draft = drafts.get(key);
    if (draft) {
      draft.files.push(game);
    } else {
      drafts.set(key, { parsed, regions: datRegionsOf(parsed, game), files: [game] });
    }
  }
  for (const draft of drafts.values()) {
    draft.files.sort((a, b) => {
      const discs = (parseGameName(a.name).disc ?? 0) - (parseGameName(b.name).disc ?? 0);
      return discs !== 0 ? discs : (a.fileName ?? a.name).localeCompare(b.fileName ?? b.name);
    });
  }
  const variants = [];
  for (const clash of byKey(drafts.values(), {}).values()) {
    const languages = clash.length > 1;
    for (const longer of byKey(clash, { languages }).values()) {
      const extras = longer.length > 1;
      for (const longest of byKey(longer, { languages, extras }).values()) {
        const checksum = longest.length > 1;
        for (const draft of longest) {
          variants.push({
            key: variantKey({ ...draft.parsed, regions: draft.regions }, {
              languages,
              extras,
              checksum: checksum ? checksumSuffix(draft.files[0]) : void 0
            }),
            datRegions: draft.regions,
            regions: regionsOf(draft.regions),
            videoStandards: videoStandardsOf(draft.regions),
            languages: draft.parsed.languages,
            revision: draft.parsed.revision,
            flags: draft.parsed.flags,
            files: draft.files
          });
        }
      }
    }
  }
  return variants.sort((a, b) => a.key.localeCompare(b.key));
}
function groupDatGames(games) {
  const byTitle = /* @__PURE__ */ new Map();
  for (const game of games) {
    const parsed = parseGameName(game.name);
    const rawId = normalizeGameName(game.name);
    const groupKey = normalizeRomanNumerals(rawId).toLowerCase();
    const entries = byTitle.get(groupKey);
    if (entries) entries.push({ parsed, game });
    else byTitle.set(groupKey, [{ parsed, game }]);
  }
  const groups = [];
  for (const [_, entries] of byTitle) {
    const titles = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const key = normalizeRomanNumerals(entry.parsed.title).toLowerCase();
      const existing = titles.get(key);
      if (existing) existing.push(entry);
      else titles.set(key, [entry]);
    }
    const collides = titles.size > 1;
    for (const [_2, titleEntries] of titles) {
      const sortedTitles = Array.from(new Set(titleEntries.map((e) => e.parsed.title))).sort();
      const title = sortedTitles.find((t) => /\d/.test(t)) ?? sortedTitles[0];
      const id = normalizeGameName(title);
      groups.push({
        id: collides ? `${id}-${checksumSuffix(titleEntries[0].game)}` : id,
        title,
        variants: buildVariants(titleEntries)
      });
    }
  }
  return groups.sort((a, b) => a.id.localeCompare(b.id));
}
export {
  groupDatGames,
  normalizeGameName,
  normalizeRomanNumerals,
  parseGameName,
  sanitizeName,
  variantKey
};
