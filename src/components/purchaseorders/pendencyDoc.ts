// A4 "Pending Orders" document for one vendor — print preview + printOrQueue.
// Pending since is the headline of every order (owner's ask). Rates are OFF
// unless asked for, the same rule as the shared PO. Every interpolated
// value goes through escHtml.
import { escHtml } from '../../lib/escape';
import { docTitle } from '../../lib/exportName';
import { PO_STATUS_LABELS } from '../../types/database';
import type { PendencyReport } from './pendencyData';

export interface PendencyDocOptions { rates?: boolean }

const inr = (n: unknown) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);
export const fmtDate = (d: string | null | undefined) => d ? new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
/** Print colours for the wait: red past 14 days, amber past 7, else ink. */
export const ageColor = (days: number) => (days > 14 ? '#B91C1C' : days > 7 ? '#B45309' : '#1F2937');
export const ageBg = (days: number) => (days > 14 ? '#FEE2E2' : days > 7 ? '#FEF3C7' : '#F3F4F6');
export const waitText = (days: number) => days === 0 ? 'since today' : days === 1 ? '1 day' : `${days} days`;

export function buildPendencyHtml(r: PendencyReport, opts: PendencyDocOptions = {}): string {
  const rates = opts.rates === true;
  const hasSku = r.pos.some(p => p.items.some(it => it.sku));
  const blocks = r.pos.map(p => {
    const rows = p.items.map((it, i) => `<tr><td>${i + 1}</td>${hasSku ? `<td class="m">${escHtml(it.sku || '—')}</td>` : ''}<td>${escHtml(it.item_name)}</td><td class="r">${qty(it.quantity)}</td><td class="r">${qty(it.received)}</td><td class="r b">${qty(it.pending)}</td><td>${escHtml(it.unit || '—')}</td>${rates ? `<td class="r">${it.rate == null ? '—' : inr(it.rate)}</td><td class="r">${it.rate == null ? '—' : inr(it.pending * it.rate)}</td>` : ''}</tr>`).join('');
    return `<section class="po">
      <div class="pohead">
        <div><span class="num">PO #${escHtml(p.po_number)}</span> <span class="sub">dated ${fmtDate(p.po_date)} · ${escHtml(PO_STATUS_LABELS[p.status] || p.status)}${p.expected_date ? ` · expected ${fmtDate(p.expected_date)}` : ''}</span></div>
        <div class="since" style="color:${ageColor(p.days)};background:${ageBg(p.days)}">Pending since ${fmtDate(p.since)} · ${waitText(p.days)}</div>
      </div>
      <table><thead><tr><th>#</th>${hasSku ? '<th>SKU</th>' : ''}<th>Item</th><th class="r">Ordered</th><th class="r">Received</th><th class="r">Pending</th><th>Unit</th>${rates ? '<th class="r">Rate</th><th class="r">Amount</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
      <div class="pofoot">${qty(p.pendingQty)} pending in ${p.items.length} line${p.items.length === 1 ? '' : 's'}${rates && p.pendingAmount != null ? ` · ₹${inr(p.pendingAmount)}` : ''}</div>
    </section>`;
  }).join('');

  const t = r.totals;
  const summary = t.orders === 0
    ? '<div class="empty">Nothing pending — every open order has been received.</div>'
    : `<div class="sum">
        <div class="cell"><div class="k">Open orders</div><div class="v">${t.orders}</div></div>
        <div class="cell"><div class="k">Pending qty</div><div class="v">${qty(t.pendingQty)}</div></div>
        ${rates && t.pendingAmount != null ? `<div class="cell"><div class="k">Pending value</div><div class="v">₹${inr(t.pendingAmount)}</div></div>` : ''}
        <div class="cell hi" style="color:${ageColor(t.oldestDays)};background:${ageBg(t.oldestDays)}"><div class="k">Oldest pending since</div><div class="v">${fmtDate(t.oldestSince)}</div><div class="k2">${waitText(t.oldestDays)}</div></div>
      </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(docTitle('Pending-Orders', r.vendor))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;font-size:12px;background:#fff}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px}
  .head h1{margin:0;font-size:18px;letter-spacing:.5px}
  .head .sub{color:#666;font-size:10px;margin-top:2px}
  .doc{text-align:right}.doc .vendor{font-size:15px;font-weight:700}.doc .sub{color:#666;font-size:10px}
  .sum{display:flex;gap:10px;margin-bottom:14px}
  .sum .cell{flex:1;border:1px solid #ddd;border-radius:6px;padding:8px 10px}
  .sum .cell.hi{flex:1.6;border-color:transparent}
  .k{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#888}.hi .k{color:inherit;opacity:.8}
  .v{font-size:16px;font-weight:700;margin-top:2px}.k2{font-size:10px;font-weight:600;margin-top:1px}
  .empty{border:1px solid #ddd;border-radius:6px;padding:14px;color:#666;text-align:center;margin-bottom:14px}
  .po{border:1px solid #e5e7eb;border-radius:6px;margin-bottom:10px;page-break-inside:avoid;overflow-x:auto}
  .pohead{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;background:#f9fafb;border-bottom:1px solid #e5e7eb}
  .num{font-weight:700;font-size:13px}.pohead .sub{color:#666;font-size:10px}
  .since{font-weight:700;font-size:11px;padding:3px 9px;border-radius:4px;white-space:nowrap}
  table{width:100%;min-width:460px;border-collapse:collapse}
  th,td{padding:5px 8px;text-align:left;border-bottom:1px solid #f1f1f4;font-size:11px}
  th{background:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#555}
  td.r,th.r{text-align:right}td.b{font-weight:700}td.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
  .pofoot{padding:5px 10px;font-size:10px;color:#666;text-align:right}
  .foot{margin-top:16px;font-size:10px;color:#666;line-height:1.5}
  @media print{body{padding:0}}
</style></head><body>
  <div class="head">
    <div><h1>Arya Designs</h1><div class="sub">Pending Orders</div></div>
    <div class="doc"><div class="vendor">${escHtml(r.vendor)}</div>${r.phone ? `<div class="sub">${escHtml(r.phone)}</div>` : ''}<div class="sub">as on ${fmtDate(r.generated)}</div></div>
  </div>
  ${summary}
  ${blocks}
  <div class="foot">Pending = ordered − received. Orders listed oldest first. This is a computer-generated statement and does not require a signature.</div>
</body></html>`;
}
