// The index backdrop is made FROM the photos (owner: "the background should
// adapt to the images, no solid colours"): a low-res mosaic of every tile,
// blurred to soft colour fields, under a scrim tinted with the collection's
// own average colour — deep for the dark mood, milky for the light one —
// and a vignette. A pink lehenga set gets a dusky rose backdrop, an olive
// shoot the sample's olive, and the blurred shapes show through faintly.
// Also the tile shadow: drawn ONCE into a sprite and stamped per tile —
// per-tile ctx.shadowBlur on a 2400 px canvas was the slowest thing here.
import { makeBlur, rr } from './canvasKit';
import type { IndexSource } from './renderIndex';

export type IndexMood = 'dark' | 'light';

const dims = (im: IndexSource): [number, number] => ('naturalWidth' in im ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height]);
export const cover = (ctx: CanvasRenderingContext2D, im: IndexSource, x: number, y: number, w: number, h: number) => {
  const [iw, ih] = dims(im);
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
};

export function paintBackdrop(ctx: CanvasRenderingContext2D, tiles: IndexSource[], W: number, H: number, mood: IndexMood): void {
  // 1. mosaic at 1/6 scale — enough for a blur, cheap to draw
  const mw = Math.ceil(W / 6), mh = Math.ceil(H / 6);
  const m = document.createElement('canvas'); m.width = mw; m.height = mh;
  const mc = m.getContext('2d')!;
  const n = Math.max(1, tiles.length);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (mw / mh))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cw = mw / cols, ch = mh / rows;
  for (let i = 0; i < cols * rows; i++) {
    if (tiles.length === 0) break;
    cover(mc, tiles[i % tiles.length], (i % cols) * cw, Math.floor(i / cols) * ch, cw + 1, ch + 1);
  }
  // 2. average colour of the collection (a 1×1 draw of the mosaic)
  const p = document.createElement('canvas'); p.width = 1; p.height = 1;
  const pc = p.getContext('2d')!; pc.imageSmoothingEnabled = true; pc.drawImage(m, 0, 0, 1, 1);
  const [r, g, b] = tiles.length ? pc.getImageData(0, 0, 1, 1).data : [74, 78, 58];
  // 3. blurred mosaic as the base
  const blur = makeBlur(m, mw, mh);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blur, 0, 0, blur.width, blur.height, 0, 0, W, H);
  ctx.restore();
  // 4. tinted scrim: the collection's colour pulled toward near-black or ivory
  const mix = (c: number, t: number, k: number) => Math.round(c + (t - c) * k);
  const tint = mood === 'dark' ? [mix(r, 12, 0.7), mix(g, 13, 0.7), mix(b, 16, 0.7)] : [mix(r, 248, 0.8), mix(g, 245, 0.8), mix(b, 239, 0.8)];
  ctx.fillStyle = `rgba(${tint.join(',')},${mood === 'dark' ? 0.76 : 0.8})`;
  ctx.fillRect(0, 0, W, H);
  // 5. vignette for depth
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, mood === 'dark' ? 'rgba(0,0,0,.45)' : 'rgba(80,60,30,.16)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/** A rounded-rect drop shadow rendered once; stamp with drawImage(c, x - pad, y - pad). */
export function makeShadow(w: number, h: number, r: number, color: string): { c: HTMLCanvasElement; pad: number } {
  const pad = 70;
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
  const x = c.getContext('2d')!;
  x.shadowColor = color; x.shadowBlur = 34; x.shadowOffsetY = 14;
  rr(x, pad, pad, w, h, r); x.fillStyle = '#000'; x.fill();
  x.shadowColor = 'transparent';
  x.globalCompositeOperation = 'destination-out';
  rr(x, pad, pad, w, h, r); x.fill(); // keep only the shadow, the tile paints over this area anyway
  return { c, pad };
}
