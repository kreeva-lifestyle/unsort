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

const W = 1080, M = 40, HERO_H = 1150;
const COL_WEIGHT: Record<string, number> = { SKU: 11, 'MAIN COLOR': 13, FABRIC: 12, SIZE: 16, INCLUDES: 14, WORK: 15, PRICE: 19 };
const inr = (n: number) => `RS.${n.toLocaleString('en-IN')}/-`;

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

interface Cell { lines: string[]; size: number }
// Wrap a cell, shrinking the font until the widest single word fits the
// column (e.g. EMBROIDERY in a narrow column) — nothing may overflow.
const fitCell = (ctx: CanvasRenderingContext2D, text: string, maxW: number, weight: number, base: number, min: number): Cell => {
  let size = base;
  for (; size > min; size--) {
    ctx.font = `${weight} ${size}px 'Inter', sans-serif`;
    if (text.split(/\s+/).every(wd => ctx.measureText(wd).width <= maxW)) break;
  }
  ctx.font = `${weight} ${size}px 'Inter', sans-serif`;
  return { lines: wrapText(ctx, text, maxW), size };
};
const lineH = (c: Cell) => c.size + 9;
const cellH = (c: Cell) => c.lines.length * lineH(c);

export async function renderRateCard(canvas: HTMLCanvasElement, o: RateCardOpts): Promise<void> {
  const cols = o.columns.filter(c => COL_WEIGHT[c]);
  const totalWeight = cols.reduce((a, c) => a + COL_WEIGHT[c], 0);
  const panelW = W - 2 * M;
  const colW = cols.map(c => (COL_WEIGHT[c] / totalWeight) * panelW);

  // ---- measure pass (scratch ctx) to size the canvas before drawing ----
  const scratch = document.createElement('canvas').getContext('2d')!;
  const headCells = cols.map((c, i) => fitCell(scratch, c, colW[i] - 24, 600, 22, 16));
  const headH = Math.max(58, Math.max(...headCells.map(cellH)) + 30);
  const rowCells = o.rows.map(r => cols.map((c, i) => fitCell(scratch, (r[c] || '—').toUpperCase(), colW[i] - 26, c === 'PRICE' || c === 'SKU' ? 600 : 400, 25, 17)));
  const rowH = rowCells.map(cells => Math.max(64, Math.max(...cells.map(cellH)) + 30));
  const tableH = headH + rowH.reduce((a, b) => a + b, 0) + 14;
  const tableY = HERO_H + 26;
  const chips: [string, string][] = o.stats ? [
    ['TOTAL DESIGNS', `${o.stats.designs} PCS`],
    ...(o.stats.total > 0 ? [['AVERAGE RATE', inr(o.stats.avg)], ['TOTAL AMOUNT', inr(o.stats.total)]] as [string, string][] : []),
  ] : [];
  const chipH = chips.length ? 96 : 0;
  const chipsY = tableY + tableH + (chips.length ? 22 : 0);
  scratch.font = "600 23px 'Inter', sans-serif";
  const discLines = o.disclaimer.trim() ? wrapText(scratch, o.disclaimer.trim().toUpperCase(), panelW - 90) : [];
  const discH = discLines.length ? discLines.length * 32 + 34 : 0;
  const discY = chipsY + chipH + (discLines.length ? 20 : 0);
  canvas.width = W;
  canvas.height = discY + discH + 34;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;

  // ---- background: cover photo, heavily darkened (glass panels sit on this) ----
  coverDraw(ctx, o.heroImg, 0, 0, W, H);
  ctx.fillStyle = 'rgba(7,9,14,0.62)';
  ctx.fillRect(0, 0, W, H);

  // frosted-glass source: the darkened background, blurred via downscale→upscale
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(W / 16)); small.height = Math.max(1, Math.round(H / 16));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(canvas, 0, 0, small.width, small.height);

  const glassPanel = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, W, H);
    ctx.fillStyle = 'rgba(11,13,19,0.48)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    rr(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.17)'; ctx.lineWidth = 1.5; ctx.stroke();
  };

  // ---- hero block: sharp cover crop fading into the frosted lower half ----
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, HERO_H); ctx.clip();
  coverDraw(ctx, o.heroImg, 0, 0, W, HERO_H);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, 'rgba(0,0,0,0.34)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 200);
  const fade = ctx.createLinearGradient(0, HERO_H - 280, 0, HERO_H);
  fade.addColorStop(0, 'rgba(7,9,14,0)'); fade.addColorStop(1, 'rgba(7,9,14,0.92)');
  ctx.fillStyle = fade; ctx.fillRect(0, HERO_H - 280, W, 280);
  ctx.restore();

  // ---- logo (top-right) + script catalog name under it ----
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
  let nameY = M + 120;
  if (o.logoImg) {
    const lw = 235, lh = lw * (o.logoImg.naturalHeight / o.logoImg.naturalWidth);
    ctx.drawImage(o.logoImg, W - M - lw, M + 4, lw, lh);
    nameY = M + 4 + lh + 96;
  }
  const name = o.catalogName.trim();
  let size = 118;
  do { ctx.font = `400 ${size}px '${o.scriptFont}', cursive`; size -= 4; } while (size > 56 && ctx.measureText(name).width > W - 2 * M - 30);
  ctx.fillStyle = '#F5EEDC'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(name, W - M - 8, Math.min(nameY, HERO_H - 90));
  ctx.restore();

  // ---- table on one glass panel ----
  glassPanel(M, tableY, panelW, tableH, 22);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const colX: number[] = []; let acc = M;
  for (const w of colW) { colX.push(acc); acc += w; }
  const drawCell = (cell: Cell, weight: number, cx: number, cyMid: number) => {
    ctx.font = `${weight} ${cell.size}px 'Inter', sans-serif`;
    const startY = cyMid - ((cell.lines.length - 1) * lineH(cell)) / 2;
    cell.lines.forEach((ln, li) => ctx.fillText(ln, cx, startY + li * lineH(cell)));
  };
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  headCells.forEach((cell, i) => drawCell(cell, 600, colX[i] + colW[i] / 2, tableY + headH / 2 + 2));
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(M + 14, tableY + headH); ctx.lineTo(M + panelW - 14, tableY + headH); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let i = 1; i < cols.length; i++) { ctx.beginPath(); ctx.moveTo(colX[i], tableY + 12); ctx.lineTo(colX[i], tableY + tableH - 12); ctx.stroke(); }
  let y = tableY + headH;
  rowCells.forEach((cells, ri) => {
    cells.forEach((cell, ci) => {
      const bold = cols[ci] === 'PRICE' || cols[ci] === 'SKU';
      ctx.fillStyle = cols[ci] === 'PRICE' ? '#F5EEDC' : 'rgba(255,255,255,0.92)';
      drawCell(cell, bold ? 600 : 400, colX[ci] + colW[ci] / 2, y + rowH[ri] / 2);
    });
    y += rowH[ri];
    if (ri < rowCells.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.moveTo(M + 14, y); ctx.lineTo(M + panelW - 14, y); ctx.stroke();
    }
  });

  // ---- footer stat chips + disclaimer band ----
  if (chips.length) {
    const gap = 14, cw = (panelW - gap * (chips.length - 1)) / chips.length;
    chips.forEach(([label, value], i) => {
      const cx = M + i * (cw + gap);
      glassPanel(cx, chipsY, cw, chipH, 18);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "600 18px 'Inter', sans-serif"; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(label, cx + cw / 2, chipsY + 32);
      ctx.font = "700 29px 'Inter', sans-serif"; ctx.fillStyle = '#fff';
      ctx.fillText(value, cx + cw / 2, chipsY + chipH - 32);
    });
  }
  if (discLines.length) {
    glassPanel(M, discY, panelW, discH, 16);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "600 23px 'Inter', sans-serif"; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    discLines.forEach((ln, i) => ctx.fillText(ln, W / 2, discY + discH / 2 - ((discLines.length - 1) * 32) / 2 + i * 32));
  }
}
