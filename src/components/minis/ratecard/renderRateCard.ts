// Pure canvas renderer for the glassmorphic rate card. Everything is drawn
// (photo, frosted panels, table, footer) so the exported JPG matches the
// preview pixel-for-pixel — CSS backdrop-filter can't be rasterized, so the
// frosted glass is a downscale→upscale blur of the background snapshot,
// which works on every browser (no ctx.filter, which Safari lacks).
//
// Layout intelligence: columns whose value is identical on every row
// (fabric, size, work…) are lifted out of the table into a "collection
// details" band under the heading — shown once, elegantly, instead of
// repeated down a column. The table keeps only what varies per design.
import { RateRow } from './parseRateSheet';
import { GOLD, font, rr, coverDraw, wrapText, uniformSize, makeBlur, drawMasthead, MeasuredCell } from './canvasKit';

export interface RateCardOpts {
  heroImg: HTMLImageElement;
  logoImg: HTMLImageElement | null;
  catalogName: string;
  rows: RateRow[];
  columns: string[];
  skuCol: string;
  priceCol: string | null;
  disclaimer: string;
  stats: { designs: number; avg: number; total: number } | null;
  scriptFont: string; // 'Great Vibes' when loaded, else Sora fallback
}

const W = 1440, M = 56, HERO_H = 1280;
const inr = (n: number) => `RS.${n.toLocaleString('en-IN')}/-`;

export async function renderRateCard(canvas: HTMLCanvasElement, o: RateCardOpts): Promise<void> {
  const panelW = W - 2 * M;
  const scratch = document.createElement('canvas').getContext('2d')!;
  const cellWeight = (c: string) => (c === o.priceCol || c === o.skuCol ? 600 : 400);
  const val = (r: RateRow, c: string) => (r[c] || '—').toUpperCase();

  // ---- split: identical-on-every-row columns become "collection details" ----
  const shared = o.columns.filter(c => c !== o.skuCol && c !== o.priceCol && o.rows.length > 1
    && (o.rows[0][c] || '') !== '' && o.rows.every(r => r[c] === o.rows[0][c]));
  const cols = o.columns.filter(c => !shared.includes(c));
  const specs: [string, string][] = shared.map(c => [c, val(o.rows[0], c)]);

  // ---- measure: collection-details band (2-column grid of label + value) ----
  const specCols = specs.length > 1 ? 2 : 1;
  const specCellW = (panelW - 56 * 2 - (specCols - 1) * 44) / specCols;
  scratch.font = font(500, 27);
  const specLines = specs.map(([, v]) => wrapText(scratch, v, specCellW));
  const specEntryH = specLines.map(l => 26 + 10 + l.length * 36);
  const specRowH: number[] = [];
  for (let i = 0; i < specs.length; i += specCols) specRowH.push(Math.max(...specEntryH.slice(i, i + specCols)));
  const specsH = specs.length ? specRowH.reduce((a, b) => a + b, 0) + (specRowH.length - 1) * 22 + 56 : 0;

  // ---- measure: table (generic column widths from content) ----
  const need = cols.map(c => {
    scratch.font = font(600, 28);
    let maxWord = Math.max(...c.split(/\s+/).map(wd => scratch.measureText(wd).width));
    let maxFull = 0;
    for (const r of o.rows) {
      scratch.font = font(cellWeight(c), 28);
      const t = val(r, c);
      maxFull = Math.max(maxFull, scratch.measureText(t).width);
      for (const wd of t.split(/\s+/)) maxWord = Math.max(maxWord, scratch.measureText(wd).width);
    }
    return Math.min(Math.max(maxWord + 34, Math.min(maxFull + 34, 380), 132), 560);
  });
  const needSum = need.reduce((a, b) => a + b, 0);
  const colW = need.map(n => (n / needSum) * panelW);
  const headSize = uniformSize(scratch, cols.map((c, i) => ({ text: c, maxW: colW[i] - 28, weight: 600 })), 24, 17);
  const bodyCells: MeasuredCell[] = o.rows.flatMap(r => cols.map((c, i) => ({ text: val(r, c), maxW: colW[i] - 30, weight: cellWeight(c) })));
  const bodySize = uniformSize(scratch, bodyCells, 29, 20);
  const headLineH = headSize + 10, bodyLineH = bodySize + 12;
  const headLines = cols.map((c, i) => { scratch.font = font(600, headSize); return wrapText(scratch, c, colW[i] - 28); });
  const headH = Math.max(66, Math.max(...headLines.map(l => l.length)) * headLineH + 34);
  const rowLines = o.rows.map(r => cols.map((c, i) => { scratch.font = font(cellWeight(c), bodySize); return wrapText(scratch, val(r, c), colW[i] - 30); }));
  const rowH = rowLines.map(cells => Math.max(76, Math.max(...cells.map(l => l.length)) * bodyLineH + 34));
  const tableH = headH + rowH.reduce((a, b) => a + b, 0) + 16;

  // ---- measure: footer ----
  const specsY = HERO_H + 30;
  const tableY = specsY + (specsH ? specsH + 24 : 0);
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

  const blur = makeBlur(canvas, W, H);

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
  const tracked = (on: boolean) => { try { (ctx as any).letterSpacing = on ? '3px' : '0px'; } catch { /* noop */ } };

  drawMasthead(ctx, { W, M, heroH: HERO_H, heroImg: o.heroImg, logoImg: o.logoImg, name: o.catalogName.trim(), scriptFont: o.scriptFont });

  // ---- collection details band: the specs shared by every design ----
  if (specs.length) {
    glassPanel(M, specsY, panelW, specsH, 26);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    specs.forEach(([label,], i) => {
      const row = Math.floor(i / specCols), col = i % specCols;
      const isLastOdd = specCols === 2 && i === specs.length - 1 && specs.length % 2 === 1;
      const cx = isLastOdd ? W / 2 : M + 56 + col * (specCellW + 44) + specCellW / 2;
      const cy = specsY + 30 + specRowH.slice(0, row).reduce((a, b) => a + b, 0) + row * 22;
      tracked(true);
      ctx.font = font(600, 19); ctx.fillStyle = 'rgba(239,223,180,0.9)';
      ctx.fillText(label, cx, cy + 12);
      tracked(false);
      ctx.font = font(500, 27); ctx.fillStyle = 'rgba(255,255,255,0.94)';
      specLines[i].forEach((ln, li) => ctx.fillText(ln, cx, cy + 52 + li * 36));
    });
    // divider between the two grid columns
    if (specCols === 2 && specs.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2, specsY + 24); ctx.lineTo(W / 2, specsY + specsH - 24); ctx.stroke();
    }
  }

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
      ctx.fillStyle = cols[ci] === o.priceCol ? GOLD : 'rgba(255,255,255,0.92)';
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
      tracked(true);
      ctx.font = font(600, 20); ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(label, cx + cw / 2, chipsY + 38);
      tracked(false);
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
