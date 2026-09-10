// Render the vendor pendency report to a PNG and share it via the phone's
// share sheet (download fallback on desktop) — the same approach as the PO
// image, so a vendor gets one picture on WhatsApp. Pending since is the
// loud element of every order. Rates are OFF unless asked for.
import type { PendencyReport, PendencyPo } from './pendencyData';
import { ageColor, ageBg, fmtDate, waitText } from './pendencyDoc';
import type { PendencyDocOptions } from './pendencyDoc';
import { exportName } from '../../lib/exportName';
import { PO_STATUS_LABELS } from '../../types/database';

const SANS = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
const trunc = (ctx: CanvasRenderingContext2D, s: string, max: number) => {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
};
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const W = 720, PAD = 36, ROW = 24, HEAD = 34, POHEAD = 34, POFOOT = 22, GAP = 12;
const blockH = (p: PendencyPo) => POHEAD + HEAD + p.items.length * ROW + POFOOT + GAP;

export function renderPendencyImage(r: PendencyReport, opts: PendencyDocOptions = {}): Promise<Blob> {
  const rates = opts.rates === true;
  const S = 2;
  const hasSku = r.pos.some(p => p.items.some(it => it.sku));
  const H = PAD + 78 + 84 + (r.pos.length ? r.pos.reduce((s, p) => s + blockH(p), 0) : 60) + 30 + PAD;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // Header
  let y = PAD + 20;
  ctx.fillStyle = '#111827'; ctx.font = `700 24px ${SANS}`; ctx.textAlign = 'left';
  ctx.fillText('Arya Designs', PAD, y);
  ctx.fillStyle = '#6B7280'; ctx.font = `400 12px ${SANS}`; ctx.fillText('Pending Orders', PAD, y + 18);
  ctx.textAlign = 'right'; ctx.fillStyle = '#111827'; ctx.font = `700 16px ${SANS}`;
  ctx.fillText(trunc(ctx, r.vendor, 300), W - PAD, y);
  ctx.fillStyle = '#6B7280'; ctx.font = `400 11px ${SANS}`;
  ctx.fillText(`${r.phone ? r.phone + ' · ' : ''}as on ${fmtDate(r.generated)}`, W - PAD, y + 18);
  y += 36;
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 14;

  // Summary strip — the oldest wait is the highlighted cell.
  const t = r.totals;
  if (t.orders === 0) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#6B7280'; ctx.font = `400 13px ${SANS}`;
    ctx.fillText('Nothing pending — every open order has been received.', W / 2, y + 40);
    y += 84;
  } else {
    const cells: { k: string; v: string; k2?: string; hi?: boolean }[] = [
      { k: 'OPEN ORDERS', v: String(t.orders) },
      { k: 'PENDING QTY', v: qty(t.pendingQty) },
      ...(rates && t.pendingAmount != null ? [{ k: 'PENDING VALUE', v: '₹' + inr(t.pendingAmount) }] : []),
      { k: 'OLDEST PENDING SINCE', v: fmtDate(t.oldestSince), k2: waitText(t.oldestDays), hi: true },
    ];
    const units = cells.reduce((s, c) => s + (c.hi ? 1.6 : 1), 0);
    const unitW = (W - PAD * 2 - 10 * (cells.length - 1)) / units;
    let x = PAD;
    for (const cell of cells) {
      const w = unitW * (cell.hi ? 1.6 : 1);
      if (cell.hi) { ctx.fillStyle = ageBg(t.oldestDays); roundRect(ctx, x, y, w, 66, 6); ctx.fill(); }
      else { ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1; roundRect(ctx, x, y, w, 66, 6); ctx.stroke(); }
      const col = cell.hi ? ageColor(t.oldestDays) : '#111827';
      ctx.textAlign = 'left'; ctx.fillStyle = cell.hi ? col : '#9CA3AF'; ctx.font = `600 9px ${SANS}`;
      ctx.fillText(cell.k, x + 12, y + 20);
      ctx.fillStyle = col; ctx.font = `700 18px ${SANS}`; ctx.fillText(cell.v, x + 12, y + 44);
      if (cell.k2) { ctx.font = `600 11px ${SANS}`; ctx.fillText(cell.k2, x + 12, y + 59); }
      x += w + 10;
    }
    y += 84;
  }

  // One block per order, oldest first.
  const cols = colX(hasSku, rates);
  for (const p of r.pos) {
    const h = blockH(p) - GAP;
    ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1; roundRect(ctx, PAD, y, W - PAD * 2, h, 6); ctx.stroke();
    ctx.fillStyle = '#F9FAFB'; ctx.fillRect(PAD + 1, y + 1, W - PAD * 2 - 2, POHEAD - 1);
    ctx.textAlign = 'left'; ctx.fillStyle = '#111827'; ctx.font = `700 13px ${SANS}`;
    ctx.fillText(`PO #${p.po_number}`, PAD + 10, y + 22);
    const numW = ctx.measureText(`PO #${p.po_number}`).width;
    ctx.fillStyle = '#6B7280'; ctx.font = `400 10px ${SANS}`;
    ctx.fillText(`dated ${fmtDate(p.po_date)} · ${PO_STATUS_LABELS[p.status] || p.status}${p.expected_date ? ` · expected ${fmtDate(p.expected_date)}` : ''}`, PAD + 10 + numW + 8, y + 22);
    const since = `Pending since ${fmtDate(p.since)} · ${waitText(p.days)}`;
    ctx.font = `700 11px ${SANS}`;
    const sw = ctx.measureText(since).width + 18;
    ctx.fillStyle = ageBg(p.days); roundRect(ctx, W - PAD - 8 - sw, y + 7, sw, 20, 4); ctx.fill();
    ctx.fillStyle = ageColor(p.days); ctx.textAlign = 'right'; ctx.fillText(since, W - PAD - 17, y + 21);
    let ry = y + POHEAD + 22;
    ctx.fillStyle = '#6B7280'; ctx.font = `600 9px ${SANS}`; ctx.textAlign = 'left';
    ctx.fillText('#', cols.num, ry); if (hasSku) ctx.fillText('SKU', cols.sku, ry); ctx.fillText('ITEM', cols.item, ry);
    ctx.textAlign = 'right'; ctx.fillText('ORDERED', cols.ord, ry); ctx.fillText('RECEIVED', cols.rec, ry); ctx.fillText('PENDING', cols.pen, ry);
    if (rates) { ctx.fillText('RATE', cols.rate, ry); ctx.fillText('AMOUNT', cols.amt, ry); }
    ctx.textAlign = 'left'; ctx.fillText('UNIT', cols.unit, ry);
    ry += 20;
    p.items.forEach((it, i) => {
      ctx.font = `400 11.5px ${SANS}`; ctx.textAlign = 'left'; ctx.fillStyle = '#111827';
      ctx.fillText(String(i + 1), cols.num, ry);
      if (hasSku) { ctx.fillStyle = '#374151'; ctx.fillText(trunc(ctx, it.sku || '—', cols.item - cols.sku - 8), cols.sku, ry); }
      ctx.fillStyle = '#111827'; ctx.fillText(trunc(ctx, it.item_name, cols.ord - 60 - cols.item), cols.item, ry);
      ctx.fillStyle = '#374151'; ctx.fillText(it.unit || '—', cols.unit, ry);
      ctx.textAlign = 'right'; ctx.fillText(qty(it.quantity), cols.ord, ry); ctx.fillText(qty(it.received), cols.rec, ry);
      ctx.fillStyle = '#111827'; ctx.font = `700 11.5px ${SANS}`; ctx.fillText(qty(it.pending), cols.pen, ry);
      if (rates) { ctx.font = `400 11.5px ${SANS}`; ctx.fillStyle = '#374151'; ctx.fillText(it.rate == null ? '—' : inr(it.rate), cols.rate, ry); ctx.fillText(it.rate == null ? '—' : inr(it.pending * it.rate), cols.amt, ry); }
      ctx.strokeStyle = '#F1F1F4'; ctx.beginPath(); ctx.moveTo(PAD + 8, ry + 8); ctx.lineTo(W - PAD - 8, ry + 8); ctx.stroke();
      ry += ROW;
    });
    ctx.textAlign = 'right'; ctx.fillStyle = '#6B7280'; ctx.font = `400 10px ${SANS}`;
    ctx.fillText(`${qty(p.pendingQty)} pending in ${p.items.length} line${p.items.length === 1 ? '' : 's'}${rates && p.pendingAmount != null ? ` · ₹${inr(p.pendingAmount)}` : ''}`, W - PAD - 10, ry + 2);
    y += blockH(p);
  }

  ctx.textAlign = 'left'; ctx.fillStyle = '#9CA3AF'; ctx.font = `400 10px ${SANS}`;
  ctx.fillText('Pending = ordered − received. Orders listed oldest first. Computer-generated statement, no signature required.', PAD, H - PAD);
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Could not render the image')), 'image/png'));
}

function colX(hasSku: boolean, rates: boolean) {
  const num = PAD + 10, sku = PAD + 30, item = hasSku ? PAD + 120 : PAD + 30;
  const right = W - PAD - 10;
  const amt = right, rate = right - 80;
  const unit = rates ? rate - 110 : right - 48;   // left-aligned, short (Meter/Piece)
  const pen = unit - 10, rec = pen - 62, ord = rec - 62;
  return { num, sku, item, ord, rec, pen, unit, rate, amt };
}

export async function sharePendencyImage(r: PendencyReport, addToast: (m: string, t?: string) => void, opts: PendencyDocOptions = {}) {
  let blob: Blob;
  try { blob = await renderPendencyImage(r, opts); }
  catch { addToast('Could not build the report image', 'error'); return; }
  const file = new File([blob], exportName('Pending-Orders', [r.vendor], 'png'), { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try { await nav.share({ files: [file], title: `Pending orders — ${r.vendor}`, text: `Pending orders — ${r.vendor}` }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') addToast('Sharing was cancelled', 'error'); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  addToast('Sharing not supported here — image downloaded', 'success');
}
