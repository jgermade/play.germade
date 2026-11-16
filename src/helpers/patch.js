// ROM-hacking patches, applied in memory — pure functions, no I/O.
//
//   IPS  records of (offset, bytes) with RLE; no checksums ("PATCH" … "EOF" [+ truncate])
//   BPS  byuu's delta format: source/target sizes, four copy actions, CRC32 of source,
//        target and the patch itself
//   UPS  XOR of source and target, with the same three CRC32s
//
// A mod never touches the stored ROM: the player gets `applyPatch(rom, patch)`.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes, start = 0, end = bytes.length) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export const hex = (n) => (n >>> 0).toString(16).padStart(8, '0');

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

export const PATCH_EXTENSIONS = ['.ips', '.bps', '.ups'];

export class PatchError extends Error {}

/** Which format a file is, from its magic; null when it is not a patch. */
export function formatOf(bytes) {
  if (bytes.length >= 8 && ascii(bytes, 0, 5) === 'PATCH') return 'ips';
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'BPS1') return 'bps';
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === 'UPS1') return 'ups';
  return null;
}

/** byuu's variable-length number (BPS / UPS). */
function reader(bytes, at) {
  let pos = at;
  return {
    get pos() {
      return pos;
    },
    byte() {
      if (pos >= bytes.length) throw new PatchError('el parche se corta antes de tiempo');
      return bytes[pos++];
    },
    number() {
      let data = 0;
      let shift = 1;
      for (;;) {
        const x = this.byte();
        data += (x & 0x7f) * shift;
        if (x & 0x80) break;
        shift *= 128;
        data += shift;
      }
      return data;
    },
  };
}

/**
 * What a patch says about itself, without applying it:
 * `{ format, sourceSize, targetSize, sourceCrc, targetCrc, valid }` — sizes and CRCs are
 * null for IPS, which carries none. `valid` checks the patch's own CRC (BPS/UPS).
 */
export function parsePatch(bytes) {
  const format = formatOf(bytes);
  if (!format) throw new PatchError('no es un parche IPS, BPS ni UPS');
  if (format === 'ips') return { format, sourceSize: null, targetSize: null, sourceCrc: null, targetCrc: null, valid: true };
  const r = reader(bytes, 4);
  const sourceSize = r.number();
  const targetSize = r.number();
  const end = bytes.length - 12;
  return {
    format,
    sourceSize,
    targetSize,
    sourceCrc: u32le(bytes, end),
    targetCrc: u32le(bytes, end + 4),
    valid: crc32(bytes, 0, bytes.length - 4) === u32le(bytes, end + 8),
  };
}

function applyIps(rom, patch) {
  let out = new Uint8Array(rom);
  let size = rom.length;
  const grow = (needed) => {
    if (needed <= out.length) return;
    const bigger = new Uint8Array(Math.max(needed, out.length * 2));
    bigger.set(out);
    out = bigger;
  };
  let i = 5;
  for (;;) {
    if (i + 3 > patch.length) throw new PatchError('IPS sin marca EOF');
    if (ascii(patch, i, 3) === 'EOF') {
      i += 3;
      break;
    }
    const offset = (patch[i] << 16) | (patch[i + 1] << 8) | patch[i + 2];
    const length = (patch[i + 3] << 8) | patch[i + 4];
    i += 5;
    if (length) {
      if (i + length > patch.length) throw new PatchError('IPS cortado');
      grow(offset + length);
      out.set(patch.subarray(i, i + length), offset);
      i += length;
    } else {
      const run = (patch[i] << 8) | patch[i + 1];
      const value = patch[i + 2];
      i += 3;
      grow(offset + run);
      out.fill(value, offset, offset + run);
      size = Math.max(size, offset + run);
      continue;
    }
    size = Math.max(size, offset + length);
  }
  // Lunar IPS' truncate extension: three more bytes give the final size.
  if (i + 3 === patch.length) size = (patch[i] << 16) | (patch[i + 1] << 8) | patch[i + 2];
  return out.slice(0, size);
}

function applyBps(rom, patch, info) {
  const r = reader(patch, 4);
  r.number();
  r.number();
  const metadata = r.number();
  for (let k = 0; k < metadata; k++) r.byte();
  const out = new Uint8Array(info.targetSize);
  const end = patch.length - 12;
  let outPos = 0;
  let sourceRel = 0;
  let targetRel = 0;
  let pos = r.pos;
  const R = reader(patch, pos);
  while (R.pos < end) {
    const data = R.number();
    const command = data % 4;
    const length = Math.floor(data / 4) + 1;
    if (outPos + length > out.length) throw new PatchError('BPS escribe fuera del resultado');
    if (command === 0) {
      out.set(rom.subarray(outPos, outPos + length), outPos);
      outPos += length;
    } else if (command === 1) {
      for (let k = 0; k < length; k++) out[outPos++] = R.byte();
    } else {
      const d = R.number();
      const delta = (d & 1 ? -1 : 1) * Math.floor(d / 2);
      if (command === 2) {
        sourceRel += delta;
        for (let k = 0; k < length; k++) out[outPos++] = rom[sourceRel++];
      } else {
        targetRel += delta;
        for (let k = 0; k < length; k++) out[outPos++] = out[targetRel++];
      }
    }
  }
  return out;
}

function applyUps(rom, patch, info) {
  const r = reader(patch, 4);
  r.number();
  r.number();
  const out = new Uint8Array(info.targetSize);
  out.set(rom.subarray(0, Math.min(rom.length, out.length)));
  const end = patch.length - 12;
  let pos = 0;
  while (r.pos < end) {
    pos += r.number();
    for (;;) {
      const x = r.byte();
      if (x === 0) {
        pos++;
        break;
      }
      if (pos < out.length) out[pos] ^= x;
      pos++;
    }
  }
  return out;
}

/**
 * The patched ROM. BPS / UPS are checked end to end — the patch's own CRC, that the
 * ROM is the one it was made for, and the result — and throw a {@link PatchError}
 * saying which failed. IPS has nothing to check.
 */
export function applyPatch(rom, patch) {
  const info = parsePatch(patch);
  if (info.format === 'ips') return applyIps(rom, patch);
  if (!info.valid) throw new PatchError('el parche está dañado (su CRC no cuadra)');
  if (crc32(rom) !== info.sourceCrc) throw new PatchError(`este mod es para otra versión de la ROM (espera CRC32 ${hex(info.sourceCrc)})`);
  const out = info.format === 'bps' ? applyBps(rom, patch, info) : applyUps(rom, patch, info);
  if (crc32(out) !== info.targetCrc) throw new PatchError('el resultado no coincide con el que el mod promete');
  return out;
}
