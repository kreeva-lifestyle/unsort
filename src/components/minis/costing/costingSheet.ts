// Product-costing print HTML: the FULL internal costing of one product —
// photo, every main/sub component with its primary supplier, material code,
// rate and cost, alternates in small print, totals incl. maintenance, notes.
// This is the internal record (it shows rates and alternate suppliers);
// the supplier-facing document is the purchase plan. Rendered in the house
// iframe print-preview. Every interpolated value goes through esc().
import {
  CostingProduct, CostingComponent, selectedSupplier, subCost, componentCost, sheetCost, totalCost, num,
} from './costingModel';
import { escHtml } from '../../../lib/escape';

const esc = escHtml;

const inr = (n: number): string =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number): string => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function costingSheetHtml(p: CostingProduct): string {
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const compBlock = (c: CostingComponent): string => `
    <h2>${esc(c.name.trim() || 'Component')}</h2>
    <table>
      <thead><tr><th>Sub component</th><th>Supplier</th><th>Material code</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Cost</th></tr></thead>
      <tbody>
        ${c.subs.map(s => {
          const sel = selectedSupplier(s);
          const alts = s.suppliers.filter(x => x !== sel && x.name.trim());
          return `<tr>
            <td>${esc(s.name)}</td>
            <td>${esc(sel?.name || '—')}${alts.length ? `<div class="alt">${alts.map(a =>
              `alt: ${esc(a.name)}${a.materialCode.trim() ? ` (${esc(a.materialCode)})` : ''} ${esc(inr(num(a.rate)))}`).join('<br>')}</div>` : ''}</td>
            <td class="mono">${esc(sel?.materialCode ?? '') || '—'}</td>
            <td class="r">${esc(qty(num(s.qty)))} ${esc(s.unit)}</td>
            <td class="r">${esc(inr(num(sel?.rate ?? '')))}</td>
            <td class="r">${esc(inr(subCost(s)))}</td>
          </tr>`;
        }).join('')}
        <tr class="sum"><td colspan="5" class="r">${esc(c.name.trim() || 'Component')} total</td><td class="r">${esc(inr(componentCost(c)))}</td></tr>
      </tbody>
    </table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Product costing ${esc(p.sku)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 11px; }
    img.product { width: 96px; height: 96px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
    h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    .r { text-align: right; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    .alt { color: #777; font-size: 10px; margin-top: 2px; }
    tr.sum td { font-weight: 700; background: #fafafa; }
    .totals { margin-top: 18px; width: 320px; margin-left: auto; }
    .totals td { border: none; border-bottom: 1px solid #eee; padding: 6px 4px; }
    .totals tr:last-child td { font-weight: 700; font-size: 13px; border-bottom: 2px solid #111; }
    .notes { margin-top: 16px; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; font-size: 11px; color: #333; white-space: pre-wrap; }
    .note { margin-top: 14px; color: #666; font-size: 10px; }
    @media print { body { margin: 10mm; } }
  </style></head><body>
    <div class="head">
      <div>
        <h1>Product costing — ${esc(p.sku)}</h1>
        <div class="meta">${esc(date)} · ${esc(String(p.components.length))} component${p.components.length === 1 ? '' : 's'} · Arya Designs</div>
      </div>
      ${p.image_url ? `<img class="product" src="${esc(p.image_url)}" alt="${esc(p.sku)}">` : ''}
    </div>
    ${p.components.map(compBlock).join('')}
    <table class="totals">
      <tr><td>Cost per pc</td><td class="r">${esc(inr(sheetCost(p.components)))}</td></tr>
      <tr><td>Maintenance</td><td class="r">${esc(String(num(p.maintenance_pct)))}%</td></tr>
      <tr><td>Total cost per pc</td><td class="r">${esc(inr(totalCost(p.components, p.maintenance_pct)))}</td></tr>
    </table>
    ${p.notes.trim() ? `<div class="notes"><b>Notes:</b> ${esc(p.notes)}</div>` : ''}
    <div class="note">Internal document — shows supplier rates and alternates. For suppliers, share the purchase plan instead.</div>
  </body></html>`;
}
