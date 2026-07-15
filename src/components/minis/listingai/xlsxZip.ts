// Minimal ZIP reader for pulling raw XML parts out of an .xlsx. SheetJS CE
// drops data validations (dropdown datasets), so the Listing AI template
// parser reads the sheet XML itself. Handles stored (method 0) and deflated
// (method 8) entries via the browser-native DecompressionStream.

export async function readZipEntries(buf: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // End-of-central-directory record: scan back for PK\x05\x06 (the trailing
  // comment can push it up to 64K from the end).
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid xlsx file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const td = new TextDecoder();
  const entries = new Map<string, () => Promise<string>>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.set(name, async () => {
      // Sizes come from the central directory (the local header may carry
      // zeros + a data descriptor); only the name/extra lengths are local.
      const lnlen = dv.getUint16(lho + 26, true);
      const lelen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lelen;
      const raw = u8.slice(start, start + csize);
      if (method === 0) return td.decode(raw);
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    });
    p += 46 + nlen + elen + clen;
  }
  return entries;
}
