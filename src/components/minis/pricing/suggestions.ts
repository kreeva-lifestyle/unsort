// Cost-cutting suggestions — deterministic, every number computed from the
// sheet and the projection; nothing invented and nothing auto-applied.
import { CostingComponent, cheaperAlt, num, money } from '../costing/costingModel';
import type { PricingConfig } from './pricingConfig';
import { PricedProduct, Projection, GST_BOUNDARY, gstPct, subRate, targetPrice } from './pricingModel';

export interface Suggestion { kind: 'supplier' | 'driver' | 'fabric' | 'price' | 'stitching' | 'maintenance' | 'gst'; title: string; detail: string; savingPerPc?: number }
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${x.toFixed(1)}%`;

export function suggestions(p: PricedProduct, _cfg: PricingConfig, pr: Projection): Suggestion[] {
  const out: Suggestion[] = [];
  const b = pr.breakdown;
  const cost = b.costPerPc;
  const marginAt = (price: number, c: number) => (price > 0 ? (price - c) / price * 100 : 0);

  // 1. Cheaper supplier alternates already recorded on the sheet.
  for (const c of p.components as CostingComponent[]) for (const s of c.subs) {
    const alt = cheaperAlt(s);
    if (!alt) continue;
    const save = r2(alt.saving * num(s.qty));
    if (save <= 0) continue;
    const after = pr.price ? ` — margin ${pct(marginAt(pr.price, cost - save))} instead of ${pct(pr.marginPct ?? 0)}` : '';
    out.push({ kind: 'supplier', title: `${s.name}: ${alt.name} is cheaper`, detail: `${money(alt.saving)}/${s.unit || 'unit'} less than the selected supplier — ${money(save)} saved per piece${after}. Tick it on the costing sheet if quality and terms allow.`, savingPerPc: save });
  }

  // 2. Biggest cost drivers by share.
  if (cost > 0) {
    const lines: { name: string; cost: number }[] = [];
    for (const c of p.components) for (const s of c.subs) { const v = r2(num(s.qty) * subRate(s)); if (v > 0) lines.push({ name: `${s.name} (${c.name})`, cost: v }); }
    for (const l of b.stitching) if (l.cost > 0) lines.push({ name: `${l.head.name} (stitching)`, cost: l.cost });
    if (b.maintenance > 0) lines.push({ name: `Maintenance ${b.maintenancePct}%`, cost: b.maintenance });
    const top = lines.sort((a, z) => z.cost - a.cost).slice(0, 3);
    if (top.length) out.push({ kind: 'driver', title: 'Where the cost goes', detail: top.map(l => `${l.name}: ${money(l.cost)} (${pct(l.cost / cost * 100)})`).join(' · ') + '. A 10% saving on the largest line is worth ' + money(r2(top[0].cost * 0.1)) + ' per piece.' });
  }

  // 3. Fabric consumption sensitivity.
  if (b.fabricMeters > 0 && b.fabric > 0) {
    const perTenth = r2(b.fabric / b.fabricMeters * 0.1);
    let need = '';
    if (pr.status === 'below_margin' && pr.price && pr.threshold.minMarginPct != null) {
      const maxCost = pr.price * (1 - pr.threshold.minMarginPct / 100);
      const cut = cost - maxCost;
      const meters = cut > 0 ? r2(cut / (b.fabric / b.fabricMeters)) : 0;
      if (meters > 0) need = meters < b.fabricMeters ? ` Using ${r2(b.fabricMeters - meters)} m instead of ${b.fabricMeters} m would meet the ${pct(pr.threshold.minMarginPct)} margin.` : ' Fabric alone cannot close the gap.';
    }
    out.push({ kind: 'fabric', title: `Fabric: ${b.fabricMeters} m per piece`, detail: `Every 0.1 m saved in cutting is ${money(perTenth)} per piece.${need}`, savingPerPc: perTenth });
  }

  // 4. Price needed for the target, and cost needed at the current price.
  const minM = pr.threshold.minMarginPct;
  if (minM != null && pr.price) {
    const priceNeeded = r2(cost / (1 - minM / 100));
    const costNeeded = r2(pr.price * (1 - minM / 100));
    const gap = pr.marginPct != null && pr.marginPct < minM;
    out.push({ kind: 'price', title: gap ? `Below the ${pct(minM)} margin floor` : `Room against the ${pct(minM)} floor`, detail: gap
      ? `At today's cost the price must be ${money(priceNeeded)} ex GST (${money(r2(priceNeeded * (1 + gstPct(priceNeeded) / 100)))} inc), or the cost must come down to ${money(costNeeded)} at ${money(pr.price)}.`
      : `The price could drop to ${money(priceNeeded)} or the cost could rise to ${money(costNeeded)} before the floor is hit.` });
  } else if (pr.profit.pct > 0 || pr.profit.fixed > 0) {
    out.push({ kind: 'price', title: 'Target price', detail: `${money(pr.target.exc)} ex GST (${money(pr.target.inc)} inc ${pr.target.gstPct}%) gives ${pr.profit.fixed > 0 ? money(pr.profit.fixed) + ' + ' : ''}${pr.profit.pct}% profit on ${money(cost)} cost.` });
  }

  // 5. Heavy stitching heads.
  for (const l of b.stitching) if (cost > 0 && l.cost / cost > 0.25) {
    out.push({ kind: 'stitching', title: `${l.head.name} is ${pct(l.cost / cost * 100)} of cost`, detail: `A 10% better rate saves ${money(r2(l.cost * 0.1))} per piece; check the head's rate in Settings → Pricing or override it for this product.`, savingPerPc: r2(l.cost * 0.1) });
  }

  // 6. Maintenance sensitivity.
  if (b.maintenancePct > 0) {
    const perPoint = r2(b.maintenance / b.maintenancePct);
    out.push({ kind: 'maintenance', title: `Maintenance ${b.maintenancePct}% = ${money(b.maintenance)}`, detail: `Each 1 point of maintenance is ${money(perPoint)} per piece (applied to ${b.maintenanceBase === 'all' ? 'materials + stitching' : 'materials only'}).`, savingPerPc: perPoint });
  }

  // 7. GST boundary: a price just above ₹2,500 pays 18% instead of 5%.
  const exc = pr.price ?? pr.target.exc;
  if (exc > GST_BOUNDARY && exc <= GST_BOUNDARY * 1.05) {
    out.push({ kind: 'gst', title: `Just over the ₹${GST_BOUNDARY.toLocaleString('en-IN')} GST line`, detail: `${money(exc)} attracts 18% GST (${money(r2(exc * 1.18))} to the buyer). At ${money(GST_BOUNDARY)} it is 5% (${money(r2(GST_BOUNDARY * 1.05))}) with ${pct(marginAt(GST_BOUNDARY, cost))} margin${pr.profit.pct ? ` versus the ${pr.profit.pct}% target price of ${money(targetPrice(cost, pr.profit))}` : ''}.` });
  }

  return out;
}
