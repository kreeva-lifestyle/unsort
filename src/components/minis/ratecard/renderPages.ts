// Pure canvas renderer for the catalog PAGES output: two photos side by
// side, edge to edge — no margin, no gap, no backdrop, no frame. Both are
// scaled to one height (whole, never cropped), so the page is exactly as
// wide as the two photos together. Each code sits INSIDE its photo, bottom
// right, white with a soft shadow so it reads on any fabric.
// An odd count leaves the last page with one photo: the other half then
// carries the brand — logo and catalog name over a blurred, tinted copy of
// that photo (owner: use the blank space; never a flat colour).
import { font, GOLD, GOLD_DEEP } from './canvasKit';
import { paintBackdrop } from './indexBackdrop';
import type { IndexTile, IndexSource } from './renderIndex';

export const PAGE_H = 1600;
export const PER_PAGE = 2;
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PER_PAGE));
export interface PageBrand { title: string; logoImg: HTMLImageElement | null; scriptFont: string }

const dims = (im: IndexSource): [number, number] => ('naturalWidth' in im ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height]);

const brandPanel = (ctx: CanvasRenderingContext2D, x: number, w: number, photo: IndexSource, b: PageBrand) => {
  const off = document.createElement('canvas'); off.width = w; off.height = PAGE_H;
  paintBackdrop(off.getContext('2d')!, [photo], w, PAGE_H, 'dark');
  ctx.drawImage(off, x, 0);
  const title = b.title.trim();
  let y = PAGE_H * (title ? 0.36 : 0.5);
  if (b.logoImg) {
    const lw = Math.round(w * 0.56), lh = lw * (b.logoImg.naturalHeight / b.logoImg.naturalWidth);
    ctx.drawImage(b.logoImg, x + (w - lw) / 2, y - lh / 2, lw, lh);
    y += lh / 2 + 110;
  }
  if (title) {
    let size = 150;
    do { ctx.font = `400 ${size}px '${b.scriptFont}', cursive`; size -= 6; } while (size > 64 && ctx.measureText(title).width > w - 120);
    const grad = ctx.createLinearGradient(0, y - size, 0, y + size * 0.3);
    grad.addColorStop(0, GOLD); grad.addColorStop(1, GOLD_DEEP);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 3;
    ctx.fillStyle = grad; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, x + w / 2, y + size * 0.35);
    ctx.restore();
  }
};

export function renderPage(canvas: HTMLCanvasElement, tiles: IndexTile[], brand?: PageBrand): void {
  const use = tiles.slice(0, PER_PAGE);
  const widths = use.map(t => { const [iw, ih] = dims(t.img); return Math.round(iw * (PAGE_H / ih)); });
  const panel = use.length === 1 && brand ? widths[0] : 0; // odd last page: brand panel as wide as the photo
  canvas.width = Math.max(1, widths.reduce((a, b) => a + b, 0) + panel); canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const tracked = (px: string) => { try { (ctx as any).letterSpacing = px; } catch { /* noop */ } };
  let x = 0;
  use.forEach((t, i) => {
    const w = widths[i];
    ctx.drawImage(t.img, x, 0, w, PAGE_H);
    // code inside the photo, bottom right
    const pad = 44;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    tracked('2px');
    ctx.font = font(700, 52);
    let label = t.sku.trim().toUpperCase();
    while (label.length > 3 && ctx.measureText(label).width > w - pad * 2) label = label.slice(0, -1);
    if (label !== t.sku.trim().toUpperCase()) label += '…';
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, x + w - pad, PAGE_H - pad);
    ctx.restore();
    tracked('0px');
    x += w;
  });
  if (panel && brand) brandPanel(ctx, x, panel, use[0].img, brand);
}
