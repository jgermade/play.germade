// Mods: IPS / BPS / UPS applied in memory. Patches are built here, by small encoders
// that follow the specs, so no third-party patch is committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, crc32, formatOf, parsePatch, PatchError } from '../src/services/patch.js';

const bytes = (...parts) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : [...p])));
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const vlq = (value) => {
  const out = [];
  for (;;) {
    const x = value & 0x7f;
    value = Math.floor(value / 128);
    if (value === 0) {
      out.push(0x80 | x);
      break;
    }
    out.push(x);
    value--;
  }
  return out;
};
const seal = (body, source, target) => {
  const withCrcs = [...body, ...u32(crc32(source)), ...u32(crc32(target))];
  return new Uint8Array([...withCrcs, ...u32(crc32(new Uint8Array(withCrcs)))]);
};

const rom = Uint8Array.from({ length: 64 }, (_, i) => i);

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
});

test('formats are told apart by their magic', () => {
  assert.equal(formatOf(bytes('PATCH', 'EOF')), 'ips');
  assert.equal(formatOf(bytes('BPS1', new Array(12).fill(0))), 'bps');
  assert.equal(formatOf(bytes('UPS1', new Array(12).fill(0))), 'ups');
  assert.equal(formatOf(bytes('hello world!!!!!')), null);
  assert.throws(() => parsePatch(bytes('nope')), PatchError);
});

test('IPS: records, RLE, growth and truncation', () => {
  const ips = bytes('PATCH', [0, 0, 2], [0, 2], [0xaa, 0xbb], [0, 0, 10], [0, 0], [0, 3], [0xcc], [0, 0, 70], [0, 1], [0xdd], 'EOF');
  const out = applyPatch(rom, ips);
  assert.equal(out.length, 71);
  assert.deepEqual([...out.subarray(0, 5)], [0, 1, 0xaa, 0xbb, 4]);
  assert.deepEqual([...out.subarray(10, 14)], [0xcc, 0xcc, 0xcc, 13]);
  assert.equal(out[70], 0xdd);
  assert.equal(rom[2], 2, 'the stored ROM is never touched');
  const truncated = bytes('PATCH', [0, 0, 0], [0, 1], [9], 'EOF', [0, 0, 32]);
  assert.equal(applyPatch(rom, truncated).length, 32);
});

test('BPS: all four actions, CRCs verified', () => {
  const target = new Uint8Array(70);
  target.set(rom.subarray(0, 8), 0); // SourceRead 8
  target.set([0xf0, 0xf1, 0xf2], 8); // TargetRead 3
  target.set(rom.subarray(40, 50), 11); // SourceCopy 10 from 40
  target.set(target.subarray(8, 11), 21); // TargetCopy 3 from 8
  target.set(rom.subarray(24, 64), 24); // SourceRead 40 (offset 24 = outPos)
  target.set(Array(6).fill(0xee), 64); // TargetRead 6
  const action = (cmd, len) => vlq(((len - 1) << 2) | cmd);
  const rel = (d) => vlq((Math.abs(d) << 1) | (d < 0 ? 1 : 0));
  const body = [
    ...bytes('BPS1'), ...vlq(rom.length), ...vlq(target.length), ...vlq(0),
    ...action(0, 8),
    ...action(1, 3), 0xf0, 0xf1, 0xf2,
    ...action(2, 10), ...rel(40),
    ...action(3, 3), ...rel(8),
    ...action(0, 40),
    ...action(1, 6), ...Array(6).fill(0xee),
  ];
  const bps = seal(body, rom, target);
  const info = parsePatch(bps);
  assert.equal(info.format, 'bps');
  assert.equal(info.sourceCrc, crc32(rom));
  assert.ok(info.valid);
  assert.deepEqual(applyPatch(rom, bps), target);

  const other = rom.slice();
  other[0] = 99;
  assert.throws(() => applyPatch(other, bps), /otra versión/);
  const damaged = bps.slice();
  damaged[8] ^= 1;
  assert.throws(() => applyPatch(rom, damaged), /dañado/);
});

test('UPS: XOR runs, growth, CRCs verified', () => {
  const target = new Uint8Array(68);
  target.set(rom);
  target[5] = 0x55;
  target[6] = 0x66;
  target[66] = 0x77;
  const xor = (i) => (rom[i] ?? 0) ^ target[i];
  const body = [
    ...bytes('UPS1'), ...vlq(rom.length), ...vlq(target.length),
    ...vlq(5), xor(5), xor(6), 0,
    ...vlq(66 - 8), xor(66), 0,
  ];
  const ups = seal(body, rom, target);
  assert.deepEqual(applyPatch(rom, ups), target);
});
