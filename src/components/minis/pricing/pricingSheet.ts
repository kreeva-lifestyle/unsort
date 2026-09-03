// Price Projector print HTML — one page: cost stack, price, margin, top
// suggestions. Every interpolated value goes through escHtml.
import { escHtml as esc, escHtml } from '../../../lib/escape';
import { money } from '../costing/costingModel';
import type { PricedProduct, Projection } from './pricingModel';
import type { Suggestion } from './suggestions';

export function pricingSheetHtml(p: PricedProduct, pr: Projection, sugs: Suggestion[]): string {
  const b = pr.breakdown;
  const row = (k: string, v: string, cls = '') => `<tr class="${cls}"><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`;
  const stitching = b.stitching.filter(l => l.enabled).map(l => row(`${l.head.name} (stitching)`, money(l.cost))).join('');
  const status = pr.status === 'ok' ? 'Within threshold' : pr.status === 'below_margin' ? 'Below minimum margin' : pr.status === 'over_cost' ? 'Over maximum cost' : 'No selling price';
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Price projection ${escHtml(p.sku)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222;padding:14mm;font-size:12px}h1{font-size:18px;margin-bottom:2px}.sub{color:#666;font-size:11px;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 8px;border-bottom:1px solid #eee}td.r{text-align:right;font-family:ui-monospace,Menlo,monospace}tr.total td{font-weight:700;border-top:2px solid #222;border-bottom:none}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.box{border:1px solid #ddd;border-radius:6px;padding:10px}.box b{display:block;font-size:16px;margin-top:2px}.tag{display:inline-block;padding:2px 8px;border-radius:4px;background:#f2f2f2;font-size:11px}ul{padding-left:18px}li{margin-bottom:6px;line-height:1.4}.foot{margin-top:16px;font-size:10px;color:#888;text-align:center}@page{size:A4;margin:10mm}</style></head><body>
<h1>Price projection — ${esc(p.sku)}</h1><div class="sub">${esc(p.category || 'No category')} · ${esc(date)} · <span class="tag">${esc(status)}</span></div>
<table><tbody>
${row('Fabric' + (b.fabricMeters ? ` (${b.fabricMeters} m)` : ''), money(b.fabric))}
${row('Material', money(b.material))}
${stitching}
${row(`Maintenance ${b.maintenancePct}% on the whole make`, money(b.maintenance))}
${row('Cost per piece', money(b.costPerPc), 'total')}
</tbody></table>
<div class="grid">
<div class="box">Target price (${pr.profit.fixed ? money(pr.profit.fixed) + ' + ' : ''}${esc(String(pr.profit.pct))}% profit)<b>${esc(money(pr.target.exc))} ex GST</b>${esc(money(pr.target.inc))} inc ${pr.target.gstPct}% GST</div>
<div class="box">Selling price${pr.priceSource === 'catalog' ? ' (catalog)' : ''}<b>${pr.price === null ? '—' : esc(money(pr.price))}</b>${pr.marginPct === null ? 'enter a price to see margin' : `${esc(money(pr.profitAmount || 0))} profit · ${esc(pr.marginPct.toFixed(1))}% margin`}</div>
</div>
${pr.threshold.source !== 'none' ? `<div class="sub">Threshold (${esc(pr.threshold.source)}): ${pr.threshold.minMarginPct != null ? `min margin ${esc(String(pr.threshold.minMarginPct))}%` : ''}${pr.threshold.minMarginPct != null && pr.threshold.maxCost != null ? ' · ' : ''}${pr.threshold.maxCost != null ? `max cost ${esc(money(pr.threshold.maxCost))}` : ''}</div>` : ''}
${sugs.length ? `<h1 style="font-size:14px;margin-bottom:6px">Suggestions</h1><ul>${sugs.slice(0, 6).map(s => `<li><strong>${esc(s.title)}</strong> — ${esc(s.detail)}</li>`).join('')}</ul>` : ''}
<div class="foot">Internal document · DailyOffice Price Projector</div></body></html>`;
}
