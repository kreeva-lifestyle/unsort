// A JPEG read at one-eighth size, without decoding the picture.
// A JPEG stores each 8 × 8 block as one average ("DC") value plus detail.
// A photo's print (print.ts) needs only the averages, so this reads those and
// steps over the detail: a 19-megapixel original takes a fraction of a second
// and almost no memory, where a full decode would not fit an edge function's
// 2 seconds of CPU. Baseline and progressive JPEGs, any chroma layout,
// restart markers; plain JavaScript, no library.
// Not read (JpegError says so): arithmetic-coded, lossless, 12-bit and CMYK.

export class JpegError extends Error {}

export interface DcImage {
  /** Average brightness (0–255) of each block of the luma plane, row by row: bw × bh values. */
  luma: Float32Array; bw: number; bh: number;
  /** The photo's own size in pixels, and how many pixels one block spans each way. */
  width: number; height: number; unitX: number; unitY: number;
  /** EXIF orientation 1–8 (1 = as stored). */
  orientation: number; progressive: boolean;
}

interface Huff { fast: Int16Array; size: Uint8Array; values: Uint8Array; maxcode: Int32Array; delta: Int32Array }
interface Comp { id: number; h: number; v: number; tq: number; stride: number; coef: Int32Array; pred: number; td: number; ta: number }
const FAST = 9;

function huff(counts: Uint8Array, values: Uint8Array): Huff {
  const size = new Uint8Array(257), codes = new Uint16Array(256);
  let k = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < counts[i]; j++) size[k++] = i + 1;
  const maxcode = new Int32Array(18), delta = new Int32Array(17), fast = new Int16Array(1 << FAST).fill(-1);
  let code = 0; k = 0;
  for (let j = 1; j <= 16; j++) {
    delta[j] = k - code;
    while (size[k] === j) codes[k++] = code++;
    if (code - 1 >= 1 << j) throw new JpegError('The photo file is damaged (code table).');
    maxcode[j] = code << (16 - j);
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  for (let i = 0; i < k; i++) {
    const s = size[i];
    if (s > FAST) continue;
    const c = codes[i] << (FAST - s), m = 1 << (FAST - s);
    for (let j = 0; j < m; j++) fast[c + j] = i;
  }
  return { fast, size, values, maxcode, delta };
}

function orientationOf(b: Uint8Array, at: number, len: number): number {
  if (len < 14 || b[at] !== 0x45 || b[at + 1] !== 0x78 || b[at + 2] !== 0x69 || b[at + 3] !== 0x66) return 0; // not "Exif" (XMP also lives in APP1)
  const t = at + 6, le = b[t] === 0x49;
  const u16 = (i: number) => (le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  const u32 = (i: number) => (le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
  const ifd = t + u32(t + 4), end = at + len;
  if (ifd + 2 > end) return 1;
  for (let i = 0, n = u16(ifd); i < n && ifd + 14 + i * 12 <= end; i++) {
    const e = ifd + 2 + i * 12;
    if (u16(e) === 0x0112) { const o = u16(e + 8); return o >= 1 && o <= 8 ? o : 1; }
  }
  return 1;
}

export function readDc(b: Uint8Array): DcImage {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new JpegError('The file is not a JPEG photo.');
  const n = b.length, q0 = new Float64Array(4), dc: (Huff | null)[] = [null, null, null, null], ac: (Huff | null)[] = [null, null, null, null];
  let pos = 2, ri = 0, orientation = 1, W = 0, H = 0, progressive = false, hmax = 1, vmax = 1, mx = 0, my = 0, seen = false;
  let comps: Comp[] = [];
  // The bit reader: `buf` holds the next bits at its top; it never reads past a marker (pos then rests on its 0xFF).
  let buf = 0, bits = 0, marker = false;
  const grow = () => {
    do {
      let byte = 0;
      if (!marker && pos < n) {
        byte = b[pos++];
        if (byte === 0xff) {
          let q = pos;
          while (q < n && b[q] === 0xff) q++;
          if (q < n && b[q] === 0) pos = q + 1; else { marker = true; pos = q - 1; byte = 0; }
        }
      }
      buf |= byte << (24 - bits); bits += 8;
    } while (bits <= 24);
  };
  const take = (k: number) => { if (bits < k) grow(); const v = buf >>> (32 - k); buf <<= k; bits -= k; return v; };
  const sym = (h: Huff | null): number => {
    if (!h) throw new JpegError('The photo file is damaged (missing table).');
    if (bits < 16) grow();
    let k = h.fast[buf >>> (32 - FAST)];
    if (k >= 0) { const s = h.size[k]; buf <<= s; bits -= s; return h.values[k]; }
    const top = buf >>> 16;
    for (k = FAST + 1; top >= h.maxcode[k]; k++);
    if (k > 16) throw new JpegError('The photo file is damaged (bad code).');
    const c = (buf >>> (32 - k)) + h.delta[k];
    buf <<= k; bits -= k;
    return h.values[c];
  };
  const diff = (h: Huff | null) => { const t = sym(h); if (!t) return 0; if (t > 16) throw new JpegError('The photo file is damaged.'); const v = take(t); return v < 1 << (t - 1) ? v - (1 << t) + 1 : v; };
  const restart = (list: Comp[]) => {
    buf = 0; bits = 0; marker = false;
    while (pos < n - 1 && !(b[pos] === 0xff && b[pos + 1] !== 0 && b[pos + 1] !== 0xff)) pos++;
    if (b[pos + 1] >= 0xd0 && b[pos + 1] <= 0xd7) pos += 2;
    for (const c of list) c.pred = 0;
  };

  const scan = (list: Comp[], ss: number, ah: number, al: number) => {
    if (progressive && ss > 0) return;                       // detail scans of a progressive photo: stepped over
    buf = 0; bits = 0; marker = false;
    for (const c of list) c.pred = 0;
    const one = list.length === 1, c0 = list[0];
    const bw = one ? Math.ceil(Math.ceil((W * c0.h) / hmax) / 8) : mx, bh = one ? Math.ceil(Math.ceil((H * c0.v) / vmax) / 8) : my;
    const block = (c: Comp, i: number) => {
      if (progressive && ah) { if (take(1)) c.coef[i] |= 1 << al; return; }
      c.pred += diff(dc[c.td]);
      c.coef[i] = c.pred * (1 << al);
      if (progressive) return;
      for (let k = 1; k < 64;) {                             // the block's detail: read past it
        const rs = sym(ac[c.ta]), s = rs & 15;
        if (!s) { if (rs !== 0xf0) break; k += 16; continue; }
        k += (rs >> 4) + 1; if (bits < s) grow(); buf <<= s; bits -= s;
      }
    };
    for (let y = 0, m = 0; y < bh; y++) for (let x = 0; x < bw; x++, m++) {
      if (ri && m && m % ri === 0) restart(list);
      if (one) block(c0, y * c0.stride + x);
      else for (const c of list) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) block(c, (y * c.v + v) * c.stride + x * c.h + h);
    }
  };

  while (pos < n - 1) {
    if (b[pos] !== 0xff) { pos++; continue; }
    const m = b[pos + 1];
    if (m === 0xff || m === 0 || (m >= 0xd0 && m <= 0xd8) || m === 0x01) { pos += m === 0xff ? 1 : 2; continue; }
    if (m === 0xd9) break;
    const len = (b[pos + 2] << 8) | b[pos + 3], at = pos + 4, end = pos + 2 + len;
    if (len < 2 || end > n) throw new JpegError('The photo file is cut short.');
    pos = end;
    if (m === 0xe1) orientation = orientationOf(b, at, len - 2) || orientation;
    else if (m === 0xdd) ri = (b[at] << 8) | b[at + 1];
    else if (m === 0xdb) for (let i = at; i < end;) { const wide = b[i] >> 4; q0[b[i] & 3] = wide ? (b[i + 1] << 8) | b[i + 2] : b[i + 1]; i += wide ? 129 : 65; }
    else if (m === 0xc4) for (let i = at; i + 17 <= end;) {
      const counts = b.subarray(i + 1, i + 17); let total = 0;
      for (let j = 0; j < 16; j++) total += counts[j];
      (b[i] >> 4 ? ac : dc)[b[i] & 3] = huff(counts, b.subarray(i + 17, i + 17 + total));
      i += 17 + total;
    } else if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (b[at] !== 8) throw new JpegError('Only ordinary 8-bit JPEG photos are checked.');
      H = (b[at + 1] << 8) | b[at + 2]; W = (b[at + 3] << 8) | b[at + 4]; progressive = m === 0xc2;
      const nc = b[at + 5];
      if (!W || !H || (nc !== 1 && nc !== 3)) throw new JpegError('Only ordinary colour or grey JPEG photos are checked.');
      if (W * H > 150_000_000) throw new JpegError('The photo is too large to check.');
      comps = Array.from({ length: nc }, (_, i) => ({ id: b[at + 6 + i * 3], h: nc === 1 ? 1 : b[at + 7 + i * 3] >> 4, v: nc === 1 ? 1 : b[at + 7 + i * 3] & 15, tq: b[at + 8 + i * 3] & 3, stride: 0, coef: new Int32Array(0), pred: 0, td: 0, ta: 0 }));
      for (const c of comps) { if (!c.h || !c.v) throw new JpegError('The photo file is damaged.'); hmax = Math.max(hmax, c.h); vmax = Math.max(vmax, c.v); }
      mx = Math.ceil(W / (8 * hmax)); my = Math.ceil(H / (8 * vmax));
      for (const c of comps) { c.stride = mx * c.h; c.coef = new Int32Array(c.stride * my * c.v); }
    } else if (m >= 0xc3 && m <= 0xcf && m !== 0xc8 && m !== 0xcc) throw new JpegError('This kind of JPEG is not checked.');
    else if (m === 0xda) {
      if (!comps.length) throw new JpegError('The photo file is damaged.');
      const ns = b[at], list: Comp[] = [];
      for (let i = 0; i < ns; i++) {
        const c = comps.find(x => x.id === b[at + 1 + i * 2]);
        if (!c) throw new JpegError('The photo file is damaged.');
        c.td = (b[at + 2 + i * 2] >> 4) & 3; c.ta = b[at + 2 + i * 2] & 3; list.push(c);
      }
      const ss = b[at + 1 + ns * 2], a = b[at + 3 + ns * 2];
      scan(list, ss, a >> 4, a & 15);
      seen = seen || !progressive || ss === 0;
      while (pos < n - 1 && !(b[pos] === 0xff && b[pos + 1] !== 0 && b[pos + 1] !== 0xff && !(b[pos + 1] >= 0xd0 && b[pos + 1] <= 0xd7))) pos++;
    }
  }
  const y = comps[0];
  if (!y || !seen) throw new JpegError('The photo file has no picture in it.');
  const bw = Math.ceil(Math.ceil((W * y.h) / hmax) / 8), bh = Math.ceil(Math.ceil((H * y.v) / vmax) / 8), k = (q0[y.tq] || 1) / 8;
  const luma = new Float32Array(bw * bh);
  for (let r = 0; r < bh; r++) for (let x = 0; x < bw; x++) luma[r * bw + x] = Math.max(0, Math.min(255, y.coef[r * y.stride + x] * k + 128));
  return { luma, bw, bh, width: W, height: H, unitX: (8 * hmax) / y.h, unitY: (8 * vmax) / y.v, orientation, progressive };
}
