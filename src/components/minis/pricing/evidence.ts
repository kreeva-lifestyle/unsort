// Evidence engine — the facts behind every Price Projector insight, computed
// from the business's own data (this SKU's purchase orders, the sheet's
// lines, the Settings stitching heads, the other costing sheets). Pure and
// deterministic: no AI, no network, every number traceable to a line the
// owner can open. The AI layer is only allowed to reason over these items
// and must cite them by id (E1, E2…).
import { money, num, selectedSupplier } from '../costing/costingModel';
import type { PricingConfig } from './pricingConfig';
import { PricedProduct, Projection, isFabricSub } from './pricingModel';
import type { PoLine } from './poLines';
import { norm } from './normName';
import { sheetEvidence, peerMissing } from './evidenceSheet';

export type EvidenceKind = 'po_fabric_for_sku' | 'po_rate_vs_sheet' | 'po_rate_history' | 'po_vendor' | 'stale_rates' | 'missing_po_rates' | 'consumption' | 'double_count' | 'placeholder_rates' | 'peer_structure';
export type EvidenceAction =
  | { type: 'use_rate'; ci: number; si: number; rate: number; label: string }
  | { type: 'exclude_head'; headId: string; label: string }
  | { type: 'open_po'; po: number; label: string };
export interface Evidence { id: string; kind: EvidenceKind; title: string; detail: string; impactPerPc: number | null; pos: number[]; action?: EvidenceAction }
export interface EvidenceInput { product: PricedProduct; projection: Projection; peers: PricedProduct[]; config: PricingConfig; poLines: PoLine[]; now?: Date }
/** `missing` says which data would unlock more — shown instead of filler. */
export interface EvidenceResult { items: Evidence[]; missing: string[] }

export interface SheetLine { ci: number; si: number; comp: string; name: string; nameN: string; qty: number; unit: string; rate: number; supplier: string; supplierN: string; fabric: boolean; cost: number }
export const sheetLines = (p: PricedProduct): SheetLine[] => p.components.flatMap((c, ci) => c.subs.map((s, si) => {
  const sel = selectedSupplier(s); const rate = num(sel?.rate); const qty = num(s.qty);
  return { ci, si, comp: c.name.trim(), name: s.name.trim(), nameN: norm(s.name), qty, unit: (s.unit || '').trim() || 'unit', rate, supplier: (sel?.name || '').trim() || '(no supplier)', supplierN: norm(sel?.name), fabric: isFabricSub(s), cost: r2(qty * rate) };
}));

export const r2 = (x: number) => Math.round(x * 100) / 100;
export const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : 'undated');
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const isMeters = (u: string | null) => ['meter', 'metre', 'mtr', 'm'].includes((u || '').trim().toLowerCase());

export function buildEvidence(inp: EvidenceInput): EvidenceResult {
  const { product: p, projection: pr } = inp;
  // Newest first — every "last purchase" below is index 0 of a filter.
  const poLines = [...inp.poLines].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.po - a.po);
  const now = inp.now ?? new Date();
  const raw: Omit<Evidence, 'id'>[] = [];
  const missing: string[] = [];
  const skuN = norm(p.sku);
  const forSku = poLines.filter(l => skuN && norm(l.sku) === skuN);
  const lines = sheetLines(p);
  const priced = lines.filter(l => l.rate > 0);

  // What was actually bought for this SKU, against what the sheet costs.
  if (forSku.length) {
    const unmatched = lines.filter(l => l.fabric && !forSku.some(x => norm(x.item) === l.nameN));
    const bought = forSku.slice(0, 6).map(l => `${l.item} — ${l.qty} ${l.unit || ''} from ${l.vendor}, PO #${l.po} (${fmtDate(l.date)})`).join('; ');
    const tail = unmatched.length
      ? ` The sheet costs ${unmatched.map(l => `${l.name} from ${l.supplier} at ${money(l.rate)}/${l.unit}`).join(', ')} — none of these fabrics appear on the SKU's purchase orders, so the sheet may not reflect what was bought.`
      : ' Every fabric line on the sheet appears on these orders.';
    raw.push({ kind: 'po_fabric_for_sku', title: `${forSku.length} PO line${forSku.length > 1 ? 's' : ''} bought for ${p.sku}`, detail: `${bought}.${tail}`, impactPerPc: null, pos: uniq(forSku.map(l => l.po)), action: { type: 'open_po', po: forSku[0].po, label: `Open PO #${forSku[0].po}` } });
  } else missing.push(`No purchase order carries SKU ${p.sku} — put the SKU on PO lines and the projector can compare bought fabric with the sheet.`);

  // Paid rate versus sheet rate, per line; the last purchase of that fabric
  // (this SKU first, any SKU otherwise).
  for (const l of priced) {
    if (!l.nameN) continue;
    const rated = poLines.filter(x => x.rate !== null && norm(x.item) === l.nameN);
    if (!rated.length) continue;
    const same = rated.filter(x => norm(x.sku) === skuN);
    const use = (same.length ? same : rated)[0];
    const diff = r2((l.rate - use.rate!) * l.qty);
    const where = same.length ? '' : `, bought for ${use.sku || 'another SKU'}`;
    raw.push({
      kind: 'po_rate_vs_sheet', title: `${l.name}: sheet ${money(l.rate)} vs paid ${money(use.rate!)}`,
      detail: `PO #${use.po} (${use.vendor}, ${fmtDate(use.date)}${where}) paid ${money(use.rate!)} per ${use.unit || l.unit}; the sheet costs it at ${money(l.rate)} per ${l.unit} from ${l.supplier}. At ${l.qty} ${l.unit} per piece the sheet is ${diff > 0 ? `${money(diff)} per piece above` : diff < 0 ? `${money(-diff)} per piece below` : 'exactly at'} the last purchase.`,
      impactPerPc: diff > 0 ? diff : null, pos: [use.po],
      // Only offer the copy when the units agree — a per-yard price must not land on a per-meter line.
      action: Math.abs(l.rate - use.rate!) >= 0.005 && (!use.unit || norm(use.unit) === norm(l.unit)) ? { type: 'use_rate', ci: l.ci, si: l.si, rate: use.rate!, label: `Use ${money(use.rate!)} as rate` } : undefined,
    });
    if (rated.length >= 2) {
      const oldest = rated[rated.length - 1].rate!; const latest = rated[0].rate!;
      raw.push({ kind: 'po_rate_history', title: `${l.name}: ${rated.length} rated purchases`, detail: rated.slice(0, 5).map(x => `${money(x.rate!)} on ${fmtDate(x.date)} (PO #${x.po}, ${x.vendor})`).join('; ') + `. ${latest > oldest ? 'Rising' : latest < oldest ? 'Falling' : 'Flat'} from ${money(oldest)} to ${money(latest)}.`, impactPerPc: null, pos: uniq(rated.map(x => x.po)) });
    }
  }

  // The sheet's suppliers as they appear on purchase orders.
  for (const sup of uniq(priced.map(l => l.supplierN).filter(Boolean))) {
    const ls = poLines.filter(x => norm(x.vendor) === sup);
    if (!ls.length) continue;
    const name = priced.find(l => l.supplierN === sup)!.supplier;
    const meters = r2(ls.filter(x => isMeters(x.unit)).reduce((t, x) => t + x.qty, 0));
    const rates = ls.filter(x => x.rate !== null).map(x => x.rate!);
    const items = uniq(ls.map(x => x.item)).slice(0, 5).join(', ');
    raw.push({ kind: 'po_vendor', title: `${name}: ${ls.length} PO line${ls.length > 1 ? 's' : ''} in 12 months`, detail: `${meters ? `${meters} m ordered` : `${ls.length} lines`} (${items}), latest PO #${ls[0].po} on ${fmtDate(ls[0].date)}. ${rates.length ? `Rates on record: ${money(Math.min(...rates))}–${money(Math.max(...rates))}.` : 'No rate is entered on any of these lines.'}`, impactPerPc: null, pos: uniq(ls.map(x => x.po)), action: { type: 'open_po', po: ls[0].po, label: `Open PO #${ls[0].po}` } });
  }

  // Sheet older than the newest related purchase.
  const related = poLines.filter(x => norm(x.sku) === skuN || priced.some(l => (l.nameN && norm(x.item) === l.nameN) || (l.supplierN && norm(x.vendor) === l.supplierN)));
  if (p.updated_at && related[0]?.date && related[0].date > p.updated_at.slice(0, 10)) {
    raw.push({ kind: 'stale_rates', title: `Sheet last saved ${fmtDate(p.updated_at.slice(0, 10))}, newer purchase on ${fmtDate(related[0].date)}`, detail: `PO #${related[0].po} (${related[0].vendor}: ${related[0].item}) is newer than this sheet. Re-check the rates before trusting the margin.`, impactPerPc: null, pos: [related[0].po], action: { type: 'open_po', po: related[0].po, label: `Open PO #${related[0].po}` } });
  }

  // Fabric bought for this SKU in pieces.
  const m = r2(forSku.filter(x => isMeters(x.unit)).reduce((t, x) => t + x.qty, 0));
  if (m > 0 && pr.breakdown.fabricMeters > 0) {
    raw.push({ kind: 'consumption', title: `${m} m bought ≈ ${Math.floor(m / pr.breakdown.fabricMeters)} pieces`, detail: `The sheet uses ${pr.breakdown.fabricMeters} m per piece; the ${m} m ordered for ${p.sku} covers about ${Math.floor(m / pr.breakdown.fabricMeters)} pieces before wastage.`, impactPerPc: null, pos: uniq(forSku.map(x => x.po)) });
  }

  raw.push(...sheetEvidence(inp, lines));
  const pm = peerMissing(p, inp.peers); if (pm) missing.push(pm);

  // Data quality, once: unrated PO lines in the last 90 days.
  const since90 = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const recent = poLines.filter(x => (x.date || '') >= since90);
  const unrated = recent.filter(x => x.rate === null).length;
  if (unrated) raw.push({ kind: 'missing_po_rates', title: `${unrated} of ${recent.length} PO lines in 90 days have no rate`, detail: 'Paid-versus-sheet comparisons need the rate on the PO line. Enter rates on purchase orders to unlock them.', impactPerPc: null, pos: [] });
  if (!poLines.some(x => x.rate !== null)) missing.push('No purchase-order line carries a rate yet, so paid rates cannot be compared with the sheet.');

  return { items: raw.map((e, i) => ({ ...e, id: `E${i + 1}` })), missing };
}
