// Pure canvas renderer for the catalog PAGES output: two photos side by
// side, edge to edge — no margin, no gap, no backdrop, no frame. Both are
// scaled to one height (whole, never cropped), so the page is exactly as
// wide as the two photos together. Each code sits INSIDE its photo, bottom
// right, white with a soft shadow so it reads on any fabric. A lone last
// photo makes a page on its own.
import { font } from './canvasKit';
import type { IndexTile, IndexSource } from './renderIndex';

export const PAGE_H = 1600;
export const PER_PAGE = 2;
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PER_PAGE));

const dims = (im: IndexSource): [number, number] => ('naturalWidth' in im ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height]);

export function renderPage(canvas: HTMLCanvasElement, tiles: IndexTile[]): void {
  const use = tiles.slice(0, PER_PAGE);
  const widths = use.map(t => { const [iw, ih] = dims(t.img); return Math.round(iw * (PAGE_H / ih)); });
  canvas.width = Math.max(1, widths.reduce((a, b) => a + b, 0)); canvas.height = PAGE_H;
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
}
