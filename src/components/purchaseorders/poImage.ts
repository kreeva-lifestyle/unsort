// Render a Purchase Order to a PNG image and share it via the phone's native
// share sheet (navigator.share). Falls back to a download where Web Share isn't
// available (desktop). Mirrors the RateCard canvas approach so we get a real,
// shareable document image without any PDF dependency.
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';
import { PO_TYPE_LABELS, PO_STATUS_LABELS } from '../../types/database';

const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const SANS = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const trunc = (ctx: CanvasRenderingContext2D, s: string, max: number) => {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
};

export function renderPoImage(po: PurchaseOrder, items: PurchaseOrderItem[]): Promise<Blob> {
  const S = 2;            // supersample for crisp text
  const W = 720, PAD = 40;
  const hasSku = items.some(it => it.sku);
  const rowH = 30;
  const totalRows = [
    Number(po.discount_amount) > 0, Number(po.tax_amount) > 0, Number(po.other_charges) > 0, Number(po.round_off) !== 0,
  ].filter(Boolean).length + 1; // + subtotal (grand drawn separately)
  const H = 150 + 96 + 34 + items.length * rowH + 24 + totalRows * 24 + 44 + 40 + PAD;

  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  let y = PAD + 20;
  // Header
  ctx.fillStyle = '#111827'; ctx.font = `700 26px ${SANS}`; ctx.textAlign = 'left';
  ctx.fillText('Arya Designs', PAD, y);
  ctx.fillStyle = '#6B7280'; ctx.font = `400 12px ${SANS}`;
  ctx.fillText('Purchase Order', PAD, y + 18);
  ctx.textAlign = 'right'; ctx.fillStyle = '#111827'; ctx.font = `700 18px ${SANS}`;
  ctx.fillText(`PO #${po.po_number}`, W - PAD, y);
  ctx.fillStyle = '#6B7280'; ctx.font = `400 12px ${SANS}`;
  ctx.fillText(fmtDate(po.po_date), W - PAD, y + 18);
  // status pill
  const stLabel = (PO_STATUS_LABELS[po.status] || po.status).toUpperCase();
  ctx.font = `700 11px ${SANS}`;
  const pw = ctx.measureText(stLabel).width + 20;
  ctx.fillStyle = '#EEF0FF'; roundRect(ctx, W - PAD - pw, y + 28, pw, 20, 5); ctx.fill();
  ctx.fillStyle = '#4338CA'; ctx.textAlign = 'center';
  ctx.fillText(stLabel, W - PAD - pw / 2, y + 42);

  y += 60;
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();

  // Vendor + details boxes
  y += 16; ctx.textAlign = 'left';
  const boxW = (W - PAD * 2 - 20) / 2;
  drawBox(ctx, PAD, y, boxW, 74);
  drawBox(ctx, PAD + boxW + 20, y, boxW, 74);
  ctx.fillStyle = '#9CA3AF'; ctx.font = `600 9px ${SANS}`;
  ctx.fillText('VENDOR', PAD + 12, y + 18);
  ctx.fillText('DETAILS', PAD + boxW + 32, y + 18);
  ctx.fillStyle = '#111827'; ctx.font = `700 14px ${SANS}`;
  ctx.fillText(trunc(ctx, po.vendor_name, boxW - 24), PAD + 12, y + 38);
  ctx.fillStyle = '#374151'; ctx.font = `400 12px ${SANS}`;
  if (po.vendor_phone) ctx.fillText('Phone: ' + po.vendor_phone, PAD + 12, y + 56);
  const dx = PAD + boxW + 32;
  ctx.fillText('Type: ' + (PO_TYPE_LABELS[po.po_type] || po.po_type), dx, y + 38);
  ctx.fillText((po.expected_date ? 'Expected: ' + fmtDate(po.expected_date) : (po.payment_terms ? 'Terms: ' + po.payment_terms : '')), dx, y + 56);

  y += 74 + 24;
  // Items table header
  const cols = colX(W, PAD, hasSku);
  ctx.fillStyle = '#F3F4F6'; ctx.fillRect(PAD, y - 18, W - PAD * 2, 26);
  ctx.fillStyle = '#6B7280'; ctx.font = `600 10px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText('#', cols.num, y);
  if (hasSku) ctx.fillText('SKU', cols.sku, y);
  ctx.fillText('ITEM', cols.item, y);
  ctx.textAlign = 'right';
  ctx.fillText('QTY', cols.qty, y); ctx.fillText('RATE', cols.rate, y); ctx.fillText('AMOUNT', cols.amount, y);
  ctx.textAlign = 'left'; ctx.fillText('UNIT', cols.unit, y);
  y += 20;

  // rows
  ctx.font = `400 12px ${SANS}`;
  items.forEach((it, i) => {
    ctx.fillStyle = '#111827'; ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), cols.num, y);
    if (hasSku) { ctx.fillStyle = '#374151'; ctx.fillText(trunc(ctx, it.sku || '—', cols.item - cols.sku - 8), cols.sku, y); }
    ctx.fillStyle = '#111827'; ctx.fillText(trunc(ctx, it.item_name, cols.qty - cols.item - 40), cols.item, y);
    ctx.fillStyle = '#374151'; ctx.fillText(it.unit || '—', cols.unit, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(Number(it.quantity)), cols.qty, y);
    ctx.fillText(it.rate == null ? '—' : inr(it.rate), cols.rate, y);
    ctx.fillText(it.amount == null ? '—' : inr(it.amount), cols.amount, y);
    ctx.strokeStyle = '#F1F1F4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD, y + 10); ctx.lineTo(W - PAD, y + 10); ctx.stroke();
    y += rowH;
  });

  // Totals (right aligned block)
  y += 14;
  const line = (label: string, val: string, bold = false) => {
    ctx.textAlign = 'left'; ctx.fillStyle = bold ? '#111827' : '#6B7280'; ctx.font = `${bold ? 700 : 400} ${bold ? 15 : 12}px ${SANS}`;
    ctx.fillText(label, W - PAD - 240, y);
    ctx.textAlign = 'right'; ctx.fillText(val, W - PAD, y);
    y += bold ? 28 : 22;
  };
  line('Subtotal', '₹' + inr(po.subtotal));
  if (Number(po.discount_amount) > 0) line(po.discount_type === 'percentage' ? `Discount (${Number(po.discount_value)}%)` : 'Discount', '−₹' + inr(po.discount_amount));
  if (Number(po.tax_amount) > 0) line(`Tax (${Number(po.tax_percent)}%)`, '₹' + inr(po.tax_amount));
  if (Number(po.other_charges) > 0) line('Other charges', '₹' + inr(po.other_charges));
  if (Number(po.round_off) !== 0) line('Round off', (Number(po.round_off) < 0 ? '−₹' : '₹') + inr(Math.abs(Number(po.round_off))));
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - PAD - 240, y - 12); ctx.lineTo(W - PAD, y - 12); ctx.stroke();
  y += 6;
  line('Grand Total', '₹' + inr(po.grand_total), true);

  // Footer
  ctx.textAlign = 'left'; ctx.fillStyle = '#9CA3AF'; ctx.font = `400 10px ${SANS}`;
  ctx.fillText('This is a computer-generated purchase order and does not require a signature.', PAD, H - PAD);

  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Could not render the image')), 'image/png'));
}

function colX(W: number, PAD: number, hasSku: boolean) {
  const num = PAD + 4;
  const sku = PAD + 26;
  const item = hasSku ? PAD + 116 : PAD + 26;
  const amount = W - PAD - 4;    // right-aligned
  const rate = amount - 92;      // right-aligned
  const unit = amount - 206;     // left-aligned (short: Meter/Piece)
  const qty = unit - 15;         // right-aligned, sits just before unit
  return { num, sku, item, unit, qty, rate, amount };
}
function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 6); ctx.stroke();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Share the PO image via the native share sheet; download as a fallback.
export async function sharePoImage(po: PurchaseOrder, items: PurchaseOrderItem[], addToast: (m: string, t?: string) => void) {
  let blob: Blob;
  try { blob = await renderPoImage(po, items); }
  catch { addToast('Could not build the PO image', 'error'); return; }
  const file = new File([blob], `PO-${po.po_number}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try { await nav.share({ files: [file], title: `Purchase Order #${po.po_number}`, text: `Purchase Order #${po.po_number} — ${po.vendor_name}` }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') addToast('Sharing was cancelled', 'error'); }
    return;
  }
  // Desktop / unsupported: download the image
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  addToast('Sharing not supported here — image downloaded', 'success');
}
