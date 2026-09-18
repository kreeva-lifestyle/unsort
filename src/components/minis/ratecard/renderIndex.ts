// Pure canvas renderer for the catalog INDEX: a grid of design photos, each
// captioned with its SKU and a small gold ornament, the brand logo beside
// (landscape) or above (portrait) the grid, on a backdrop made from the
// photos themselves (indexBackdrop.ts). Everything is drawn, so the
// exported JPG is the preview.
import { GOLD, GOLD_DEEP, rr, font } from './canvasKit';
import { paintBackdrop, makeShadow, cover } from './indexBackdrop';
import type { IndexMood } from './indexBackdrop';

export type IndexSource = HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export interface IndexTile { img: IndexSource; sku: string }
export type IndexLayout = 'landscape' | 'portrait';
export type { IndexMood };
export interface IndexOpts {
  tiles: IndexTile[];
  title: string;
  mood: IndexMood;
  layout: IndexLayout;
  logoImg: HTMLImageElement | null;
  scriptFont: string;
}

// text / gold per mood: the rate card's pale gold on dark, a deeper gold on
// light where the pale one washes out.
export const INDEX_MOODS: Record<IndexMood, { label: string; text: string; shadow: string; gold: string; gold2: string }> = {
  dark:  { label: 'Dark',  text: '#FFFFFF', shadow: 'rgba(0,0,0,.55)', gold: GOLD, gold2: GOLD_DEEP },
  light: { label: 'Light', text: '#1F2024', shadow: 'rgba(60,40,10,.3)', gold: '#B8933F', gold2: '#8A6A25' },
};

export const INDEX_MAX_TILES = 40;
const TILE_W = 400, TILE_H = 600, GAP = 48, M = 88, LABEL_H = 118, LOGO_COL = 440, TITLE_H = 170, LOGO_TOP_H = 300;

/** Canvas size for a tile count and layout — the editor shows it before generating. */
export const indexGeometry = (n: number, layout: IndexLayout, hasTitle: boolean) => {
  const cols = Math.max(1, Math.min(layout === 'landscape' ? 4 : 3, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const gridW = cols * TILE_W + (cols - 1) * GAP;
  const gridH = rows * (TILE_H + LABEL_H) + (rows - 1) * GAP;
  const W = M + gridW + (layout === 'landscape' ? GAP + LOGO_COL : 0) + M;
  const H = M + (hasTitle ? TITLE_H : 0) + (layout === 'portrait' ? LOGO_TOP_H : 0) + gridH + M;
  return { cols, rows, gridW, gridH, W, H };
};

const ornament = (ctx: CanvasRenderingContext2D, cx: number, cy: number, gold: string, gold2: string) => {
  const g = ctx.createLinearGradient(cx - 70, cy, cx + 70, cy);
  g.addColorStop(0, gold2); g.addColorStop(0.5, gold); g.addColorStop(1, gold2);
  ctx.fillStyle = g; ctx.strokeStyle = g; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill();
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(cx + d * 16, cy); ctx.lineTo(cx + d * 58, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + d * 65, cy, 3, 0, Math.PI * 2); ctx.fill();
  }
};

export function renderIndex(canvas: HTMLCanvasElement, o: IndexOpts): void {
  const th = INDEX_MOODS[o.mood];
  const title = o.title.trim();
  const { cols, gridW, gridH, W, H } = indexGeometry(o.tiles.length, o.layout, !!title);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  paintBackdrop(ctx, o.tiles.map(t => t.img), W, H, o.mood);
  const shadow = makeShadow(TILE_W, TILE_H, 12, th.shadow);

  let y = M;
  const tracked = (px: string) => { try { (ctx as any).letterSpacing = px; } catch { /* noop */ } };

  // ---- portrait: logo centred on top ----
  if (o.layout === 'portrait' && o.logoImg) {
    const lw = 380, lh = lw * (o.logoImg.naturalHeight / o.logoImg.naturalWidth);
    ctx.drawImage(o.logoImg, (W - lw) / 2, y + (LOGO_TOP_H - 40 - lh) / 2, lw, lh);
  }
  if (o.layout === 'portrait') y += LOGO_TOP_H;

  // ---- optional catalog name in the script face ----
  if (title) {
    let size = 128;
    do { ctx.font = `400 ${size}px '${o.scriptFont}', cursive`; size -= 6; } while (size > 60 && ctx.measureText(title).width > gridW - 20);
    const grad = ctx.createLinearGradient(0, y, 0, y + TITLE_H);
    grad.addColorStop(0, th.gold); grad.addColorStop(1, th.gold2);
    ctx.fillStyle = grad; ctx.textBaseline = 'alphabetic';
    ctx.textAlign = o.layout === 'landscape' ? 'left' : 'center';
    ctx.fillText(title, o.layout === 'landscape' ? M : W / 2, y + TITLE_H - 58);
    y += TITLE_H;
  }

  // ---- tiles ----
  const gridTop = y;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  o.tiles.forEach((t, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = M + c * (TILE_W + GAP);
    const ty = gridTop + r * (TILE_H + LABEL_H + GAP);
    ctx.drawImage(shadow.c, x - shadow.pad, ty - shadow.pad);
    ctx.save();
    rr(ctx, x, ty, TILE_W, TILE_H, 12); ctx.clip();
    cover(ctx, t.img, x, ty, TILE_W, TILE_H);
    ctx.restore();
    rr(ctx, x + 0.75, ty + 0.75, TILE_W - 1.5, TILE_H - 1.5, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.5; ctx.stroke();
    // caption
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    tracked('1.5px');
    ctx.font = font(700, 38); ctx.fillStyle = th.text;
    let label = t.sku.trim().toUpperCase();
    while (label.length > 3 && ctx.measureText(label).width > TILE_W - 16) label = label.slice(0, -1);
    if (label !== t.sku.trim().toUpperCase()) label += '…';
    ctx.fillText(label, x + TILE_W / 2, ty + TILE_H + 46);
    tracked('0px');
    ornament(ctx, x + TILE_W / 2, ty + TILE_H + 92, th.gold, th.gold2);
  });

  // ---- landscape: logo in its own column, centred on the grid ----
  if (o.layout === 'landscape' && o.logoImg) {
    const lw = LOGO_COL - 60, lh = lw * (o.logoImg.naturalHeight / o.logoImg.naturalWidth);
    ctx.drawImage(o.logoImg, M + gridW + GAP + 30, gridTop + (gridH - lh) / 2, lw, lh);
  }
}
