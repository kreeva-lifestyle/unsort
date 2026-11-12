// A photo's print: 256 bits that describe where it is light and dark, so the
// same photo saved again (another size, another JPEG quality, a slightly
// different brightness) gives almost the same bits, and another photo does
// not. Pure arithmetic, no dependencies:
//   1. the photo is averaged down to a 64 × 64 grid of brightness — from the
//      block averages a JPEG already stores (jpegDc.ts), so nothing is decoded;
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

/** For each of the GRID cells along one side: the samples it covers and how much of each (weights add up to 1). */
function spans(samples: number, unit: number, size: number): { from: number; w: number[] }[] {
  const out: { from: number; w: number[] }[] = [];
  for (let c = 0; c < GRID; c++) {
    const lo = (c * size) / GRID, hi = ((c + 1) * size) / GRID;
    const s0 = Math.min(samples - 1, Math.floor(lo / unit)), s1 = Math.min(samples - 1, Math.max(s0, Math.ceil(hi / unit) - 1));
    const w: number[] = [];
    let sum = 0;
    for (let s = s0; s <= s1; s++) { const v = Math.max(0, Math.min(hi, Math.min((s + 1) * unit, size)) - Math.max(lo, s * unit)); w.push(v); sum += v; }
    out.push({ from: s0, w: sum > 0 ? w.map(v => v / sum) : w.map((_, i) => (i ? 0 : 1)) });
  }
  return out;
}

/** The GRID × GRID brightness table of a picture given as samples, each `unitX` × `unitY` pixels of a
 *  `width` × `height` photo (a JPEG's block averages: 8 × 8; plain pixels: 1 × 1). Area-weighted. */
export function gridOf(luma: ArrayLike<number>, sw: number, sh: number, width: number, height: number, unitX = 1, unitY = 1): Float64Array {
  const xs = spans(sw, unitX, width), ys = spans(sh, unitY, height);
  const rows = new Float64Array(sh * GRID);
  for (let y = 0; y < sh; y++) for (let c = 0; c < GRID; c++) {
    const { from, w } = xs[c];
    let s = 0;
    for (let i = 0; i < w.length; i++) s += luma[y * sw + from + i] * w[i];
    rows[y * GRID + c] = s;
  }
  const grid = new Float64Array(GRID * GRID);
  for (let r = 0; r < GRID; r++) {
    const { from, w } = ys[r];
    for (let c = 0; c < GRID; c++) {
      let s = 0;
      for (let i = 0; i < w.length; i++) s += rows[(from + i) * GRID + c] * w[i];
      grid[r * GRID + c] = s;
    }
  }
  return grid;
}

/** Brightness of RGBA pixels (4 bytes a pixel), one value a pixel. */
export function lumaOf(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return out;
}

/** The grid as the photo is meant to be seen: EXIF orientation 1–8 undone (a phone stores a turned photo sideways). */
export function turned(grid: Float64Array, orientation: number): Float64Array {
  if (!(orientation >= 2 && orientation <= 8)) return grid;
  const out = new Float64Array(GRID * GRID), L = GRID - 1;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    const [sr, sc] = orientation === 2 ? [r, L - c] : orientation === 3 ? [L - r, L - c] : orientation === 4 ? [L - r, c]
      : orientation === 5 ? [c, r] : orientation === 6 ? [L - c, r] : orientation === 7 ? [L - c, L - r] : [c, L - r];
    out[r * GRID + c] = grid[sr * GRID + sc];
  }
  return out;
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

/** The print of a brightness grid: 64 hex characters, and how much detail the picture has. */
export function printOf(grid: Float64Array): { hex: string; detail: number } {
  if (grid.length !== GRID * GRID) throw new Error('The photo has no pixels to read.');
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
