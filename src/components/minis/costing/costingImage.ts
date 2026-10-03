// Product costing → one tall image for WhatsApp (owner: "share option same
// like PO, image should also be shown"). Draws what the costing sheet PDF
// shows — product photo, every component with its supplier, code, qty, rate
// and cost (alternates in small grey), totals incl. maintenance, selling
// price + margin when known, notes — then the attached photos in a grid.
// Pure canvas; the caller loads the images (costingShare.ts) so this can be
// run in a harness with stand-in bitmaps.
import {
  CostingProduct, CostingComponent, CostingAttachment, selectedSupplier, subCost, componentCost, sheetCost, totalCost, num,
} from './costingModel';
import { fileSize, isImage } from './attachmentsStore';

export interface LoadedImages { product: HTMLImageElement | null; attachments: { a: CostingAttachment; img: HTMLImageElement | null }[] }

export const IMG_W = 800;
const PAD = 40, SCALE = 2, PHOTO = 132, CELL_GAP = 12;
const SANS = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "ui-monospace, Menlo, Consolas, monospace";
const inr = (n: number) => (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyS = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};
const trunc = (ctx: CanvasRenderingContext2D, s: string, max: number) => {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
};
const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= max || !line) line = next; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
};
/** Draw an image cropped to fill a rounded box (like CSS object-fit: cover). */
const cover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) => {
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
};

/** One pass over the layout. With `dry` nothing is painted — only the
 *  height is measured, so the canvas can be sized exactly before painting. */
function draw(ctx: CanvasRenderingContext2D, p: CostingProduct, imgs: LoadedImages, dry: boolean): number {
  const W = IMG_W, R = W - PAD;
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
    ctx.font = font; if (dry) return; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string) => { if (dry) return; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const hline = (y: number, color: string, width = 1) => { if (dry) return; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(R, y); ctx.stroke(); };
  const photoBox = (img: HTMLImageElement | null, x: number, y: number, w: number, h: number, label: string) => {
    if (dry) return;
    if (img) { cover(ctx, img, x, y, w, h, 8); return; }
    ctx.fillStyle = '#F3F4F6'; roundRect(ctx, x, y, w, h, 8); ctx.fill();
    text(label, x + w / 2, y + h / 2 + 4, `400 10px ${SANS}`, '#9CA3AF', 'center');
  };

  // ---- header: brand + SKU on the left, product photo on the right ----
  let y = PAD;
  const hasPhoto = !!p.image_url;
  text('Arya Designs', PAD, y + 22, `700 24px ${SANS}`, '#111827');
  text('Product costing', PAD, y + 40, `400 12px ${SANS}`, '#6B7280');
  text(p.sku.trim().toUpperCase() || '—', PAD, y + 76, `700 22px ${MONO}`, '#111827');
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const lines = p.components.reduce((t, c) => t + c.subs.length, 0);
  text([p.category?.trim(), date, `${p.components.length} component${p.components.length === 1 ? '' : 's'} · ${lines} line${lines === 1 ? '' : 's'}`].filter(Boolean).join('  ·  '), PAD, y + 96, `400 12px ${SANS}`, '#6B7280');
  if (hasPhoto) photoBox(imgs.product, R - PHOTO, y, PHOTO, PHOTO, 'photo unavailable');
  y += Math.max(104, hasPhoto ? PHOTO : 0) + 14;
  hline(y, '#111827', 2);

  // ---- components ----
  const col = { sub: PAD + 8, sup: PAD + 196, code: PAD + 392, qty: PAD + 522, rate: PAD + 612, cost: R - 8 };
  const compBlock = (c: CostingComponent) => {
    y += 30;
    text((c.name.trim() || 'Component').toUpperCase(), PAD, y, `700 13px ${SANS}`, '#111827');
    y += 10;
    rect(PAD, y, R - PAD, 24, '#F3F4F6');
    const hf = `600 10px ${SANS}`;
    text('SUB COMPONENT', col.sub, y + 16, hf, '#6B7280'); text('SUPPLIER', col.sup, y + 16, hf, '#6B7280'); text('CODE', col.code, y + 16, hf, '#6B7280');
    text('QTY', col.qty, y + 16, hf, '#6B7280', 'right'); text('RATE', col.rate, y + 16, hf, '#6B7280', 'right'); text('COST', col.cost, y + 16, hf, '#6B7280', 'right');
    y += 24;
    for (const s of c.subs) {
      const sel = selectedSupplier(s);
      const alts = s.suppliers.filter(x => x !== sel && x.name.trim());
      y += 19;
      ctx.font = `400 12px ${SANS}`;
      text(trunc(ctx, s.name.trim() || '—', col.sup - col.sub - 10), col.sub, y, `400 12px ${SANS}`, '#111827');
      text(trunc(ctx, sel?.name.trim() || '—', col.code - col.sup - 10), col.sup, y, `400 12px ${SANS}`, '#111827');
      ctx.font = `400 11px ${MONO}`;
      text(trunc(ctx, sel?.materialCode.trim() || '—', col.qty - col.code - 70), col.code, y, `400 11px ${MONO}`, '#374151');
      text(`${qtyS(num(s.qty))} ${s.unit}`.trim(), col.qty, y, `400 12px ${SANS}`, '#111827', 'right');
      text(inr(num(sel?.rate)), col.rate, y, `400 12px ${SANS}`, '#111827', 'right');
      text(inr(subCost(s)), col.cost, y, `600 12px ${SANS}`, '#111827', 'right');
      for (const a of alts) {
        y += 14;
        ctx.font = `400 10px ${SANS}`;
        text(trunc(ctx, `alt: ${a.name.trim()}${a.materialCode.trim() ? ` (${a.materialCode.trim()})` : ''} ${inr(num(a.rate))}`, col.qty - col.sup - 10), col.sup, y, `400 10px ${SANS}`, '#6B7280');
      }
      y += 8;
      hline(y, '#EEEFF2');
    }
    y += 19;
    text(`${c.name.trim() || 'Component'} total`, col.rate, y, `700 12px ${SANS}`, '#111827', 'right');
    text(inr(componentCost(c)), col.cost, y, `700 12px ${SANS}`, '#111827', 'right');
    y += 6;
  };
  p.components.forEach(compBlock);

  // ---- totals, right-aligned block ----
  y += 26;
  const tx = R - 320;
  const line = (label: string, val: string, color = '#111827', bold = false) => {
    y += bold ? 26 : 22;
    text(label, tx, y, `${bold ? 700 : 400} ${bold ? 14 : 12}px ${SANS}`, bold ? color : '#6B7280');
    text(val, R, y, `${bold ? 700 : 500} ${bold ? 15 : 12}px ${SANS}`, color, 'right');
  };
  const cost = sheetCost(p.components), total = totalCost(p.components, p.maintenance_pct);
  line('Cost per pc', inr(cost));
  line(`Maintenance ${num(p.maintenance_pct)}%`, inr(total - cost));
  if (!dry) { ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, y + 10); ctx.lineTo(R, y + 10); ctx.stroke(); }
  line('Total cost per pc', inr(total), '#111827', true);
  const sell = num(p.selling_price ?? '');
  if (sell > 0) {
    line('Selling price', inr(sell));
    const m = sell - total;
    line(`Margin ${(m / sell * 100).toFixed(1)}%`, inr(m), m >= 0 ? '#15803D' : '#B91C1C', true);
  }

  // ---- notes ----
  if (p.notes.trim()) {
    y += 28;
    ctx.font = `400 12px ${SANS}`;
    const ls = wrap(ctx, p.notes.trim(), R - PAD - 24);
    if (!dry) { ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1; roundRect(ctx, PAD, y, R - PAD, 16 + ls.length * 17 + 8, 6); ctx.stroke(); }
    text('NOTES', PAD + 12, y + 16, `600 10px ${SANS}`, '#6B7280');
    ls.forEach((l, i) => text(l, PAD + 12, y + 34 + i * 17, `400 12px ${SANS}`, '#374151'));
    y += 16 + ls.length * 17 + 8;
  }

  // ---- attachments: photo grid, PDFs as lines ----
  const list = imgs.attachments;
  if (list.length) {
    y += 30;
    text(`ATTACHMENTS · ${list.length}`, PAD, y, `700 13px ${SANS}`, '#111827');
    y += 10;
    const photos = list.filter(x => isImage(x.a)), pdfs = list.filter(x => !isImage(x.a));
    const cols = 3, cell = (R - PAD - CELL_GAP * (cols - 1)) / cols;
    photos.forEach((x, i) => {
      const cx = PAD + (i % cols) * (cell + CELL_GAP), cy = y + Math.floor(i / cols) * (cell + 22 + CELL_GAP);
      photoBox(x.img, cx, cy, cell, cell, 'photo unavailable');
      ctx.font = `400 10px ${SANS}`;
      text(trunc(ctx, x.a.name, cell), cx + cell / 2, cy + cell + 14, `400 10px ${SANS}`, '#6B7280', 'center');
    });
    if (photos.length) y += Math.ceil(photos.length / cols) * (cell + 22 + CELL_GAP) - CELL_GAP;
    pdfs.forEach(x => { y += 20; ctx.font = `400 12px ${SANS}`; text(trunc(ctx, `PDF · ${x.a.name} · ${fileSize(x.a.size)}`, R - PAD), PAD, y, `400 12px ${SANS}`, '#374151'); });
  }

  // ---- footer ----
  y += 34;
  text('Internal document — shows supplier rates and alternates. For suppliers, share the purchase plan instead.', PAD, y, `400 10px ${SANS}`, '#9CA3AF');
  return y + PAD;
}

export function renderCostingImage(p: CostingProduct, imgs: LoadedImages): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 10;
  const H = Math.ceil(draw(c.getContext('2d')!, p, imgs, true));
  c.width = IMG_W * SCALE; c.height = H * SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, IMG_W, H);
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  draw(ctx, p, imgs, false);
  return c;
}
