// Purchase-plan print HTML: "to make N pcs of <SKU>, buy THIS from THESE
// suppliers". Grouped by supplier (that is how purchasing actually happens),
// with material codes front and centre, then a cost summary. Rendered in the
// house iframe print-preview (no window.open) and printed / saved as PDF from
// there. Every interpolated value goes through esc() — sheet text is user
// input.
import { CostingComponent, purchasePlan, totalCost, sheetCost, num, PlanLine } from './costingModel';
import { escHtml } from '../../../lib/escape';

const esc = escHtml;

const inr = (n: number): string =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const qty = (n: number): string =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function purchasePlanHtml(
  sku: string, imageUrl: string | null, components: CostingComponent[],
  pieces: number, maintenancePct: number | string,
): string {
  const { lines, suppliers } = purchasePlan(components, pieces);
  const grand = lines.reduce((t, l) => t + l.cost, 0);
  const perPc = sheetCost(components);
  const total = totalCost(components, maintenancePct) * pieces;
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const supplierBlock = (sup: string): string => {
    const rows = lines.filter(l => l.supplier === sup);
    const subTotal = rows.reduce((t, l) => t + l.cost, 0);
    return `
    <h2>${esc(sup)}</h2>
    <table>
      <thead><tr><th>Material code</th><th>Item</th><th>Component</th><th class="r">Per pc</th><th class="r">Buy (${esc(String(pieces))} pcs)</th><th class="r">Rate</th><th class="r">Cost</th></tr></thead>
      <tbody>
        ${rows.map(l => `<tr>
          <td class="mono">${esc(l.materialCode) || '—'}</td>
          <td>${esc(l.sub)}</td>
          <td class="dim">${esc(l.component)}</td>
          <td class="r">${esc(qty(l.perPc))} ${esc(l.unit)}</td>
          <td class="r"><b>${esc(qty(l.totalQty))} ${esc(l.unit)}</b></td>
          <td class="r">${esc(inr(l.rate))}</td>
          <td class="r">${esc(inr(l.cost))}</td>
        </tr>`).join('')}
        <tr class="sum"><td colspan="6" class="r">Total from ${esc(sup)}</td><td class="r">${esc(inr(subTotal))}</td></tr>
      </tbody>
    </table>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><title>Purchase plan ${esc(sku)}</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #555; font-size: 11px; }
    img.product { width: 84px; height: 84px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
    h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; }
    th { background: #f2f2f2; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    .r { text-align: right; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
    .dim { color: #666; }
    tr.sum td { font-weight: 700; background: #fafafa; }
    .totals { margin-top: 18px; width: 320px; margin-left: auto; }
    .totals td { border: none; border-bottom: 1px solid #eee; padding: 6px 4px; }
    .totals tr:last-child td { font-weight: 700; font-size: 13px; border-bottom: 2px solid #111; }
    .note { margin-top: 14px; color: #666; font-size: 10px; }
    @media print { body { margin: 10mm; } }
  </style></head><body>
    <div class="head">
      <div>
        <h1>Purchase plan — ${esc(sku)}</h1>
        <div class="meta">For <b>${esc(String(pieces))} pcs</b> · ${esc(date)} · ${esc(String(suppliers.length))} supplier${suppliers.length === 1 ? '' : 's'} · Arya Designs</div>
      </div>
      ${imageUrl ? `<img class="product" src="${esc(imageUrl)}" alt="${esc(sku)}">` : ''}
    </div>
    ${suppliers.map(supplierBlock).join('')}
    <table class="totals">
      <tr><td>Material purchase total</td><td class="r">${esc(inr(grand))}</td></tr>
      <tr><td>Cost per pc</td><td class="r">${esc(inr(perPc))}</td></tr>
      <tr><td>Maintenance</td><td class="r">${esc(String(num(maintenancePct)))}%</td></tr>
      <tr><td>Total cost (${esc(String(pieces))} pcs, incl. maintenance)</td><td class="r">${esc(inr(total))}</td></tr>
    </table>
    <div class="note">Buy quantities are rounded up. Rates are the selected supplier's rate on the product costing; alternates are not shown here.</div>
  </body></html>`;
}

export type { PlanLine };
