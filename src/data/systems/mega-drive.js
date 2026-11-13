// Mega Drive / Genesis ROM identification — pure functions, no I/O.
//
// What a cartridge says about itself lives in its header at 0x100:
//   0x100  system ("SEGA MEGA DRIVE", "SEGA GENESIS"…)
//   0x120  domestic title (48 bytes)    0x150  overseas title (48 bytes)
//   0x180  serial and revision, e.g. "GM 76334511-12"
// Enough to group the builds of one game (regions, revisions, homebrew versions)
// under one tile. A DAT match (No-Intro, as ROM Manager does) can replace this later.

export const SYSTEM = {
  id: 'megadrive',
  title: 'Mega Drive',
  extensions: ['.bin', '.gen', '.md', '.smd'],
};

const ascii = (bytes, start, length) => {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    const c = bytes[i];
    out += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
};

const usable = (text) => text.length >= 2 && /[A-Za-z0-9]/.test(text) && !/^[\s\x00\xff]*$/.test(text);

/** "FINAL FIGHT MD+ - V0.94b+" → "FINAL FIGHT MD+"; "PANG" → "PANG". */
export function stripVersion(title) {
  return title
    .replace(/\s*[-:(\[]?\s*v(er(sion)?)?\s*\.?\s*\d+(\.\d+)*[a-z]*\+?\s*[)\]]?\s*$/i, '')
    .replace(/\s*\((rev|beta|proto)[^)]*\)\s*$/i, '')
    .trim();
}

export const slug = (text) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rom';

/** Display case: "OLD TOWERS" → "Old Towers", keeping short tokens like MD+ or II upper. */
export function displayTitle(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map((word) =>
      /^(md|cd|ii|iii|iv|vi|rpg|usa|eu|jp|3d|x)\+?$/i.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

const baseName = (fileName) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

/**
 * What the launcher needs to file a ROM: which game it is (`gameId`), how to show it,
 * and how to tell its versions apart.
 */
export function identify(bytes, fileName = 'rom.bin') {
  const name = baseName(fileName);
  const interleaved = bytes.length % 0x4000 === 512; // SMD dump: header unreadable as is
  const system = interleaved ? '' : ascii(bytes, 0x100, 16);
  const hasHeader = /^SEGA/i.test(system);

  const overseas = hasHeader ? ascii(bytes, 0x150, 48) : '';
  const domestic = hasHeader ? ascii(bytes, 0x120, 48) : '';
  const rawTitle = usable(overseas) ? overseas : usable(domestic) ? domestic : name.replace(/[_.]+/g, ' ');
  const serial = hasHeader ? ascii(bytes, 0x180, 14) : '';
  const revision = /-(\d{2})$/.exec(serial)?.[1] ?? null;

  const base = stripVersion(rawTitle) || rawTitle;
  return {
    system: SYSTEM.id,
    gameId: slug(base),
    title: displayTitle(base),
    serial: serial || null,
    revision,
    name,
    interleaved,
  };
}

/** Newest first: higher revision, then the one added last. */
export function sortVersions(versions) {
  return [...versions].sort(
    (a, b) => (Number(b.revision ?? -1) - Number(a.revision ?? -1)) || (b.addedAt ?? 0) - (a.addedAt ?? 0),
  );
}
