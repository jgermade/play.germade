// A minimal ZIP reader: enough to pull ROMs out of the archives they usually come in.
// Stored (0) and deflated (8) entries; inflating uses the platform's own
// DecompressionStream, so there is no dependency to ship.

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `[{ name, bytes() }]` for every file in the archive (directories skipped). */
export function readZip(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // End of central directory: scan back over a possible trailing comment.
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No es un archivo ZIP válido');

  const count = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (u32(view, offset) !== 0x02014b50) throw new Error('ZIP dañado');
    const method = u16(view, offset + 10);
    const compressed = u32(view, offset + 20);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const local = u32(view, offset + 42);
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;

    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    const raw = data.subarray(start, start + compressed);
    entries.push({
      name,
      method,
      bytes: async () => {
        if (method === 0) return raw.slice();
        if (method === 8) return inflateRaw(raw);
        throw new Error(`${name}: compresión ${method} no soportada`);
      },
    });
  }
  return entries;
}
