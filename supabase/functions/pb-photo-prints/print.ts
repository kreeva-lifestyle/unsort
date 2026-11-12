// A photo's print: 256 bits that describe where it is light and dark, so the
// same photo saved again (another size, another JPEG quality, a slightly
// different brightness) gives almost the same bits, and another photo does
// not. Pure arithmetic on decoded pixels, no dependencies:
//   1. the photo is averaged down to a 64 × 64 grid of brightness;
//   2. a cosine transform keeps the 16 × 16 slowest patterns (the flat
//      average is left out), so fine detail and compression noise drop away;
//   3. each of the 256 values becomes one bit: above or below their median.
// Two prints are compared by counting the bits that differ (0 = the same
// picture, about 128 = unrelated). Colour is not part of it: a recoloured
// photo of the same pose prints the same — which is why a match is only ever
// a suggestion for a person.
// `detail` (0–100) says how much there is to tell apart: a blank or nearly
// flat picture has almost none, and its print means nothing.

const GRID = 64, KEEP = 16;

/** The photo as a GRID × GRID table of average brightness (0–255), row by row. */
export function lumaGrid(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Float64Array {
  const sum = new Float64Array(GRID * GRID), cnt = new Uint32Array(GRID * GRID);
  const col = new Uint16Array(w);
  for (let x = 0; x < w; x++) col[x] = Math.min(GRID - 1, Math.floor((x * GRID) / w));
  for (let y = 0; y < h; y++) {
    const row = Math.min(GRID - 1, Math.floor((y * GRID) / h)) * GRID;
    let i = y * w * 4;
    for (let x = 0; x < w; x++, i += 4) {
      const c = row + col[x];
      sum[c] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      cnt[c]++;
    }
  }
  // A photo narrower or shorter than the grid leaves cells empty: they take their neighbour's value.
  for (let c = 0; c < sum.length; c++) sum[c] = cnt[c] ? sum[c] / cnt[c] : NaN;
  for (let c = 0; c < sum.length; c++) if (Number.isNaN(sum[c])) sum[c] = c % GRID ? sum[c - 1] : (c >= GRID ? sum[c - GRID] : 0);
  for (let c = 0; c < sum.length; c++) if (Number.isNaN(sum[c])) sum[c] = 0;
  return sum;
}

const COS = (() => { // COS[u][x] = cos((2x + 1) u π / 2·GRID) for u = 1 … KEEP
  const t: Float64Array[] = [];
  for (let u = 1; u <= KEEP; u++) {
    const r = new Float64Array(GRID);
    for (let x = 0; x < GRID; x++) r[x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * GRID));
    t.push(r);
  }
  return t;
})();

/** How much there is to tell apart, 0–100: the average step between neighbouring cells of the grid. */
export function detailOf(grid: Float64Array): number {
  let d = 0;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const c = y * GRID + x;
    if (x + 1 < GRID) d += Math.abs(grid[c] - grid[c + 1]);
    if (y + 1 < GRID) d += Math.abs(grid[c] - grid[c + GRID]);
  }
  return Math.min(100, Math.round((d / (2 * GRID * (GRID - 1))) * 5)); // product photos: 50–80 · a size chart: about 20 · a blank: 0
}

/** The print of decoded pixels (RGBA, 4 bytes a pixel): 64 hex characters, and how much detail the photo has. */
export function printOf(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): { hex: string; detail: number } {
  if (!(w > 0 && h > 0) || rgba.length < w * h * 4) throw new Error('The photo has no pixels to read.');
  const grid = lumaGrid(rgba, w, h);
  const rows = new Float64Array(GRID * KEEP); // each grid row, transformed along x
  for (let y = 0; y < GRID; y++) for (let u = 0; u < KEEP; u++) {
    let s = 0;
    for (let x = 0; x < GRID; x++) s += grid[y * GRID + x] * COS[u][x];
    rows[y * KEEP + u] = s;
  }
  const out = new Float64Array(KEEP * KEEP); // then along y
  for (let v = 0; v < KEEP; v++) for (let u = 0; u < KEEP; u++) {
    let s = 0;
    for (let y = 0; y < GRID; y++) s += rows[y * KEEP + u] * COS[v][y];
    out[v * KEEP + u] = s;
  }
  const sorted = Float64Array.from(out).sort();
  const median = (sorted[127] + sorted[128]) / 2;
  let hex = '';
  for (let i = 0; i < 256; i += 4) {
    const n = (out[i] > median ? 8 : 0) | (out[i + 1] > median ? 4 : 0) | (out[i + 2] > median ? 2 : 0) | (out[i + 3] > median ? 1 : 0);
    hex += n.toString(16);
  }
  return { hex, detail: detailOf(grid) };
}

/** How many of the 256 bits differ between two prints. */
export function bitsApart(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

/** Width and height from a JPEG's own header, without decoding it (null when it is not a JPEG we can size). */
export function jpegSize(b: Uint8Array): { w: number; h: number; progressive: boolean } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }                    // fill bytes
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], progressive: m === 0xc2 };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}
