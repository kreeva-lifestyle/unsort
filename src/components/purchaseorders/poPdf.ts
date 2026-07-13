// A4 Purchase Order document — self-contained HTML string for the print
// overlay + printOrQueue. Every interpolated value goes through escHtml to
// prevent HTML injection from vendor names / item names / notes.
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';
import { PO_TYPE_LABELS, PO_STATUS_LABELS } from '../../types/database';

const escHtml = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function buildPoPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): string {
  const rows = items.map((it, i) => {
    const rate = it.rate == null ? '—' : inr(it.rate);
    const amt = it.amount == null ? '—' : inr(it.amount);
    return `<tr><td>${i + 1}</td><td>${escHtml(it.item_name)}</td><td class="r">${Number(it.quantity)}</td><td>${escHtml(it.unit || '—')}</td><td class="r">${rate}</td><td class="r">${amt}</td></tr>`;
  }).join('');

  const money = (label: string, val: unknown, sign = '') =>
    `<tr><td>${escHtml(label)}</td><td class="r">${sign}₹${inr(val)}</td></tr>`;
  const totalRows = [
    money('Subtotal', po.subtotal),
    Number(po.discount_amount) > 0 ? money(po.discount_type === 'percentage' ? `Discount (${Number(po.discount_value)}%)` : 'Discount', po.discount_amount, '−') : '',
    Number(po.tax_amount) > 0 ? money(`Tax (${Number(po.tax_percent)}%)`, po.tax_amount) : '',
    Number(po.other_charges) > 0 ? money('Other charges', po.other_charges) : '',
    Number(po.round_off) !== 0 ? money('Round off', po.round_off, Number(po.round_off) < 0 ? '−' : '') : '',
  ].filter(Boolean).join('');

  const vendorLines = [
    po.vendor_phone ? `<div>Phone: ${escHtml(po.vendor_phone)}</div>` : '',
    po.notes ? '' : '',
  ].filter(Boolean).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Purchase Order #${escHtml(po.po_number)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:12px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
  .head h1{margin:0;font-size:18px;letter-spacing:.5px}
  .head .sub{color:#666;font-size:10px;margin-top:2px}
  .doc{text-align:right}
  .doc .num{font-size:15px;font-weight:700}
  .doc .st{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;background:#eef;color:#334}
  .grid{display:flex;gap:20px;margin-bottom:14px}
  .grid .box{flex:1;border:1px solid #ddd;border-radius:6px;padding:8px 10px}
  .grid .box h3{margin:0 0 4px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888}
  .grid .box .name{font-weight:700;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #eee;font-size:11px}
  th{background:#f4f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  td.r,th.r{text-align:right}
  .totals{width:260px;margin-left:auto}
  .totals table{margin:0}
  .totals td{border:none;padding:3px 8px}
  .totals .grand td{border-top:2px solid #111;font-weight:700;font-size:14px;padding-top:6px}
  .foot{margin-top:16px;font-size:10px;color:#666;line-height:1.5}
  @media print{body{padding:0}}
</style></head><body>
  <div class="head">
    <div><h1>Arya Designs</h1><div class="sub">Purchase Order</div></div>
    <div class="doc">
      <div class="num">PO #${escHtml(po.po_number)}</div>
      <div class="sub">${fmtDate(po.po_date)}</div>
      <span class="st">${escHtml(PO_STATUS_LABELS[po.status] || po.status)}</span>
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <h3>Vendor</h3>
      <div class="name">${escHtml(po.vendor_name)}</div>
      ${vendorLines}
    </div>
    <div class="box">
      <h3>Details</h3>
      <div>Type: ${escHtml(PO_TYPE_LABELS[po.po_type] || po.po_type)}</div>
      ${po.expected_date ? `<div>Expected: ${fmtDate(po.expected_date)}</div>` : ''}
      ${po.payment_terms ? `<div>Terms: ${escHtml(po.payment_terms)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals"><table>${totalRows}<tr class="grand"><td>Grand Total</td><td class="r">₹${inr(po.grand_total)}</td></tr></table></div>
  ${po.notes ? `<div class="foot"><strong>Notes:</strong> ${escHtml(po.notes)}</div>` : ''}
  <div class="foot">This is a computer-generated purchase order and does not require a signature.</div>
</body></html>`;
}
