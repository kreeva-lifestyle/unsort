// The exact numbers and evidence one projection hands to the AI, plus their
// fingerprint. Lives outside ProjectorSheet so the sheet stays a view.
import { useEffect, useMemo, useState } from 'react';
import { num } from '../costing/costingModel';
import type { PricingConfig } from './pricingConfig';
import type { PricedProduct, Projection } from './pricingModel';
import type { PoLine } from './poLines';
import { buildEvidence, EvidenceResult } from './evidence';
import { inputHash } from './aiSuggestions';

export function useProjectionFacts(p: PricedProduct, pr: Projection, config: PricingConfig, peers: PricedProduct[], poLines: PoLine[]) {
  const evidence: EvidenceResult = useMemo(() => buildEvidence({ product: p, projection: pr, peers, config, poLines }), [p, pr, peers, config, poLines]);
  const facts = useMemo(() => ({
    sku: p.sku, category: p.category || null,
    fabric: pr.breakdown.fabric, fabricMeters: pr.breakdown.fabricMeters, material: pr.breakdown.material,
    stitching: pr.breakdown.stitching.filter(l => l.enabled).map(l => ({ head: l.head.name, basis: l.head.basis, rate: l.rate, cost: l.cost })),
    maintenancePct: pr.breakdown.maintenancePct, maintenance: pr.breakdown.maintenance, costPerPc: pr.breakdown.costPerPc,
    profit: pr.profit, targetPriceExGst: pr.target.exc, gstPct: pr.target.gstPct,
    sellingPrice: pr.price, priceSource: pr.priceSource, profitAmount: pr.profitAmount, marginPct: pr.marginPct,
    threshold: { minMarginPct: pr.threshold.minMarginPct, maxCost: pr.threshold.maxCost, source: pr.threshold.source }, status: pr.status,
    lines: p.components.flatMap(c => c.subs.map(s => ({ component: c.name, sub: s.name, qty: num(s.qty), unit: s.unit, suppliers: s.suppliers.filter(x => x.name.trim()).length }))),
    // Evidence is part of the fingerprint: a new PO or a changed peer sheet
    // makes a saved batch stale exactly like a changed cost does.
    evidence: evidence.items.map(e => ({ id: e.id, kind: e.kind, title: e.title, detail: e.detail, impactPerPc: e.impactPerPc })),
  }), [p, pr, evidence]);
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => { let alive = true; inputHash(facts).then(h => { if (alive) setHash(h); }); return () => { alive = false; }; }, [facts]);
  return { facts, evidence, hash };
}
