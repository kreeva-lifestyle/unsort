// Pure canvas renderer for the glassmorphic rate card. Everything is drawn
// (photo, frosted panels, table, footer) so the exported JPG matches the
// preview pixel-for-pixel — CSS backdrop-filter can't be rasterized, so the
// frosted glass is a downscale→upscale blur of the background snapshot,
// which works on every browser (no ctx.filter, which Safari lacks).
import { RateRow } from './parseRateSheet';

export interface RateCardOpts {
  heroImg: HTMLImageElement;
  logoImg: HTMLImageElement | null;
  catalogName: string;
  rows: RateRow[];
  columns: string[];
  disclaimer: string;
  stats: { designs: number; avg: number; total: number } | null;
  scriptFont: string; // 'Great Vibes' when loaded, else Sora fallback
}

const W = 1440, M = 56, HERO_H = 1280;
const COL_WEIGHT: Record<string, number> = { SKU: 11, 'MAIN COLOR': 13, FABRIC: 12, SIZE: 16, INCLUDES: 14, WORK: 15, PRICE: 19 };
const GOLD = '#EFDFB4', GOLD_DEEP = '#D9BC7E';
const inr = (n: number) => `RS.${n.toLocaleString('en-IN')}/-`;
const font = (weight: number, size: number) => `${weight} ${size}px 'Inter', sans-serif`;

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// object-fit: cover for drawImage
const coverDraw = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next; else { lines.push(cur); cur = wd; }
  }
  lines.push(cur);
  return lines;
};

// ONE font size for the whole group (all header cells / all body cells):
// the largest size at which every word of every cell fits its column.
// Uniform sizing reads as designed; per-cell shrinking reads as broken.
interface MeasuredCell { text: string; maxW: number; weight: number }
const uniformSize = (ctx: CanvasRenderingContext2D, cells: MeasuredCell[], base: number, min: number): number => {
  for (let size = base; size > min; size--) {
    if (cells.every(c => {
      ctx.font = font(c.weight, size);
      return c.text.split(/\s+/).every(wd => ctx.measureText(wd).width <= c.maxW);
    })) return size;
  }
  return min;
};

export async function renderRateCard(canvas: HTMLCanvasElement, o: RateCardOpts): Promise<void> {
  const cols = o.columns.filter(c => COL_WEIGHT[c]);
  const totalWeight = cols.reduce((a, c) => a + COL_WEIGHT[c], 0);
  const panelW = W - 2 * M;
  const colW = cols.map(c => (COL_WEIGHT[c] / totalWeight) * panelW);
  const cellWeight = (c: string) => (c === 'PRICE' || c === 'SKU' ? 600 : 400);

  // ---- measure pass (scratch ctx) to size the canvas before drawing ----
  const scratch = document.createElement('canvas').getContext('2d')!;
  const headSize = uniformSize(scratch, cols.map((c, i) => ({ text: c, maxW: colW[i] - 28, weight: 600 })), 24, 17);
  const bodyCells: MeasuredCell[] = o.rows.flatMap(r => cols.map((c, i) => ({ text: (r[c] || '—').toUpperCase(), maxW: colW[i] - 30, weight: cellWeight(c) })));
  const bodySize = uniformSize(scratch, bodyCells, 29, 20);
  const headLineH = headSize + 10, bodyLineH = bodySize + 12;
  const headLines = cols.map((c, i) => { scratch.font = font(600, headSize); return wrapText(scratch, c, colW[i] - 28); });
  const headH = Math.max(66, Math.max(...headLines.map(l => l.length)) * headLineH + 34);
  const rowLines = o.rows.map(r => cols.map((c, i) => { scratch.font = font(cellWeight(c), bodySize); return wrapText(scratch, (r[c] || '—').toUpperCase(), colW[i] - 30); }));
  const rowH = rowLines.map(cells => Math.max(76, Math.max(...cells.map(l => l.length)) * bodyLineH + 34));
  const tableH = headH + rowH.reduce((a, b) => a + b, 0) + 16;
  const tableY = HERO_H + 30;
  const chips: [string, string][] = o.stats ? [
    ['TOTAL DESIGNS', `${o.stats.designs} PCS`],
    ...(o.stats.total > 0 ? [['AVERAGE RATE', inr(o.stats.avg)], ['TOTAL AMOUNT', inr(o.stats.total)]] as [string, string][] : []),
  ] : [];
  const chipH = chips.length ? 116 : 0;
  const chipsY = tableY + tableH + (chips.length ? 26 : 0);
  scratch.font = font(600, 26);
  const discLines = o.disclaimer.trim() ? wrapText(scratch, o.disclaimer.trim().toUpperCase(), panelW - 110) : [];
  const discH = discLines.length ? discLines.length * 36 + 42 : 0;
  const discY = chipsY + chipH + (discLines.length ? 24 : 0);
  canvas.width = W;
  canvas.height = discY + discH + 40;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;

  // ---- background: cover photo, heavily darkened (glass panels sit on this) ----
  coverDraw(ctx, o.heroImg, 0, 0, W, H);
  ctx.fillStyle = 'rgba(7,9,14,0.62)';
  ctx.fillRect(0, 0, W, H);

  // frosted-glass source: the darkened background, blurred via multi-step
  // downscale→upscale (single-step 16× upscaling leaves blocky artifacts)
  const step = (src: HTMLCanvasElement, w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const cc = c.getContext('2d')!;
    cc.imageSmoothingEnabled = true;
    cc.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };
  let blur = step(step(step(canvas, W / 4, H / 4), W / 16, H / 16), W / 4, H / 4);
  blur = step(step(blur, W / 16, H / 16), W / 4, H / 4); // second cycle ≈ double radius

  const glassPanel = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blur, 0, 0, blur.width, blur.height, 0, 0, W, H);
    ctx.fillStyle = 'rgba(11,13,19,0.48)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    rr(ctx, x + 1, y + 1, w - 2, h - 2, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.17)'; ctx.lineWidth = 2; ctx.stroke();
  };

  // ---- hero block: sharp cover crop fading into the frosted lower half ----
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, HERO_H); ctx.clip();
  coverDraw(ctx, o.heroImg, 0, 0, W, HERO_H);
  const top = ctx.createLinearGradient(0, 0, 0, 240);
  top.addColorStop(0, 'rgba(0,0,0,0.38)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 240);
  const fade = ctx.createLinearGradient(0, HERO_H - 320, 0, HERO_H);
  fade.addColorStop(0, 'rgba(7,9,14,0)'); fade.addColorStop(1, 'rgba(7,9,14,0.92)');
  ctx.fillStyle = fade; ctx.fillRect(0, HERO_H - 320, W, 320);
  ctx.restore();

  // ---- masthead: logo top-right, then the catalog name as the hero heading
  // (large gold-gradient script) with a letter-spaced RATE LIST kicker ----
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 3;
  let logoBottom = M + 10;
  if (o.logoImg) {
    const lw = 300, lh = lw * (o.logoImg.naturalHeight / o.logoImg.naturalWidth);
    ctx.drawImage(o.logoImg, W - M - lw, M + 6, lw, lh);
    logoBottom = M + 6 + lh;
  }
  const name = o.catalogName.trim();
  let size = 210;
  do { ctx.font = `400 ${size}px '${o.scriptFont}', cursive`; size -= 6; } while (size > 84 && ctx.measureText(name).width > W - 2 * M - 40);
  const nameBase = Math.min(logoBottom + 60 + size * 0.9, HERO_H - 190);
  const grad = ctx.createLinearGradient(0, nameBase - size, 0, nameBase + size * 0.25);
  grad.addColorStop(0, GOLD); grad.addColorStop(1, GOLD_DEEP);
  ctx.fillStyle = grad; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, W - M - 10, nameBase);
  try { (ctx as any).letterSpacing = '10px'; } catch { /* older browsers: skip tracking */ }
  ctx.font = font(600, 24); ctx.fillStyle = 'rgba(245,238,220,0.78)';
  ctx.fillText('RATE LIST', W - M - 10, nameBase + 64);
  try { (ctx as any).letterSpacing = '0px'; } catch { /* noop */ }
  ctx.restore();

  // ---- table on one glass panel: header band, zebra rows, uniform fonts ----
  glassPanel(M, tableY, panelW, tableH, 26);
  ctx.save();
  rr(ctx, M, tableY, panelW, tableH, 26); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.fillRect(M, tableY, panelW, headH);
  let zy = tableY + headH;
  rowH.forEach((h, ri) => { if (ri % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(M, zy, panelW, h); } zy += h; });
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const colX: number[] = []; let acc = M;
  for (const w of colW) { colX.push(acc); acc += w; }
  const drawLines = (lines: string[], weight: number, sz: number, lh: number, cx: number, cyMid: number) => {
    ctx.font = font(weight, sz);
    const startY = cyMid - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, li) => ctx.fillText(ln, cx, startY + li * lh));
  };
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  headLines.forEach((lines, i) => drawLines(lines, 600, headSize, headLineH, colX[i] + colW[i] / 2, tableY + headH / 2 + 2));
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(M + 16, tableY + headH); ctx.lineTo(M + panelW - 16, tableY + headH); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let i = 1; i < cols.length; i++) { ctx.beginPath(); ctx.moveTo(colX[i], tableY + 14); ctx.lineTo(colX[i], tableY + tableH - 14); ctx.stroke(); }
  let y = tableY + headH;
  rowLines.forEach((cells, ri) => {
    cells.forEach((lines, ci) => {
      ctx.fillStyle = cols[ci] === 'PRICE' ? GOLD : 'rgba(255,255,255,0.92)';
      drawLines(lines, cellWeight(cols[ci]), bodySize, bodyLineH, colX[ci] + colW[ci] / 2, y + rowH[ri] / 2);
    });
    y += rowH[ri];
    if (ri < rowLines.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(M + 16, y); ctx.lineTo(M + panelW - 16, y); ctx.stroke();
    }
  });

  // ---- footer stat chips + disclaimer band ----
  if (chips.length) {
    const gap = 18, cw = (panelW - gap * (chips.length - 1)) / chips.length;
    chips.forEach(([label, value], i) => {
      const cx = M + i * (cw + gap);
      glassPanel(cx, chipsY, cw, chipH, 20);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      try { (ctx as any).letterSpacing = '3px'; } catch { /* noop */ }
      ctx.font = font(600, 20); ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(label, cx + cw / 2, chipsY + 38);
      try { (ctx as any).letterSpacing = '0px'; } catch { /* noop */ }
      ctx.font = font(700, 34); ctx.fillStyle = i === 0 ? '#fff' : GOLD;
      ctx.fillText(value, cx + cw / 2, chipsY + chipH - 38);
    });
  }
  if (discLines.length) {
    glassPanel(M, discY, panelW, discH, 18);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(600, 26); ctx.fillStyle = 'rgba(255,255,255,0.85)';
    discLines.forEach((ln, i) => ctx.fillText(ln, W / 2, discY + discH / 2 - ((discLines.length - 1) * 36) / 2 + i * 36));
  }
}
