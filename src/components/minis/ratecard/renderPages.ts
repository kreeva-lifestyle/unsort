// Pure canvas renderer for the catalog PAGES output (owner's sample): two
// SKUs per page, each photo shown whole (contain, never cropped) on a clean
// white sheet with its code right-aligned beneath it. No backdrop, no
// frame, no logo — "just the images with code". A lone last photo sits
// centred. Pages are numbered only in the file name.
import { font } from './canvasKit';
import type { IndexTile, IndexSource } from './renderIndex';

export const PAGE_W = 1800;
const M = 70, GAP = 70, LABEL_H = 120;
export const BOX_W = (PAGE_W - 2 * M - GAP) / 2;
export const BOX_H = Math.round(BOX_W * 1.5);
export const PAGE_H = M + BOX_H + LABEL_H + M / 2;
export const PER_PAGE = 2;
export const pageCount = (n: number) => Math.max(1, Math.ceil(n / PER_PAGE));

const dims = (im: IndexSource): [number, number] => ('naturalWidth' in im ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height]);

export function renderPage(canvas: HTMLCanvasElement, tiles: IndexTile[]): void {
  canvas.width = PAGE_W; canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const tracked = (px: string) => { try { (ctx as any).letterSpacing = px; } catch { /* noop */ } };
  tiles.slice(0, PER_PAGE).forEach((t, i) => {
    const x = tiles.length === 1 ? (PAGE_W - BOX_W) / 2 : M + i * (BOX_W + GAP);
    const y = M;
    // contain: the whole photo, centred across, sitting on the box's bottom
    // line so the code is always directly beneath it whatever the proportions
    const [iw, ih] = dims(t.img);
    const s = Math.min(BOX_W / iw, BOX_H / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(t.img, x + (BOX_W - dw) / 2, y + BOX_H - dh, dw, dh);
    // code, right-aligned under the photo
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    tracked('2px');
    ctx.font = font(700, 46); ctx.fillStyle = '#1F2024';
    let label = t.sku.trim().toUpperCase();
    while (label.length > 3 && ctx.measureText(label).width > BOX_W) label = label.slice(0, -1);
    if (label !== t.sku.trim().toUpperCase()) label += '…';
    ctx.fillText(label, x + BOX_W, y + BOX_H + LABEL_H / 2 + 4);
    tracked('0px');
  });
}
