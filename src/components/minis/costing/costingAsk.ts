// Natural "ask" engine for Product Costing — pure and deterministic: every
// answer is computed from the loaded costings (no AI, nothing invented).
// "what is the cost of fabric salsa" → the Salsa sub-component wherever it
// appears, with EVERY supplier's rate and material code (owner's spec), not
// just the selected one. Also understands supplier questions ("what do we
// buy from Arvachin") and product questions ("DRS210 cost").
import {
  CostingProduct, CostingSupplier, selectedSupplier, subCost, totalCost, sheetCost, num,
} from './costingModel';

export interface ItemHit {
  sku: string; component: string; sub: string;
  qty: number; unit: string; cost: number;
  suppliers: { name: string; materialCode: string; rate: number; selected: boolean }[];
}
export interface SupplierHit {
  sku: string; component: string; sub: string;
  qty: number; unit: string; materialCode: string; rate: number; selected: boolean;
}
export interface ProductHit { sku: string; perPc: number; total: number; components: { name: string; cost: number }[] }

export type AskAnswer =
  | { kind: 'item'; term: string; hits: ItemHit[] }
  | { kind: 'supplier'; name: string; hits: SupplierHit[] }
  | { kind: 'product'; hit: ProductHit }
  | { kind: 'none'; hint: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string) => norm(s).split(' ').filter(Boolean);

// Words that carry the QUESTION, not the thing being asked about.
const FILLER = new Set([
  'what', 'whats', 'is', 'the', 'a', 'an', 'of', 'for', 'per', 'in', 'on', 'at', 'to',
  'cost', 'costs', 'costing', 'rate', 'rates', 'price', 'prices', 'pricing',
  'how', 'much', 'many', 'does', 'do', 'we', 'i', 'me', 'my', 'our',
  'give', 'show', 'tell', 'find', 'get', 'and', 'with', 'all', 'its', 'their',
  'supplier', 'suppliers', 'material', 'code', 'codes', 'buy', 'purchase', 'from', 'by',
]);

const supRow = (x: CostingSupplier, selected: boolean) =>
  ({ name: x.name.trim(), materialCode: x.materialCode.trim(), rate: num(x.rate), selected });

/** Answer a free-text question against the loaded costings. Priority:
 *  a known SKU in the question wins, then a known supplier name, then the
 *  remaining words are treated as an item (sub-component) to find. */
export function askCosting(question: string, products: CostingProduct[]): AskAnswer {
  const q = norm(question);
  const qTok = tokens(question);
  if (!q) return { kind: 'none', hint: 'Type a question first' };

  // 1. Product: any word matches a costed SKU exactly.
  const bySku = new Map(products.map(p => [norm(p.sku), p]));
  for (const t of qTok) {
    const p = bySku.get(t);
    if (p) {
      return { kind: 'product', hit: {
        sku: p.sku, perPc: totalCost(p.components, p.maintenance_pct), total: sheetCost(p.components),
        components: p.components.map(c => ({ name: c.name.trim() || '(unnamed)', cost: c.subs.reduce((s, x) => s + subCost(x), 0) })),
      } };
    }
  }

  // 2. Supplier: the question contains a known supplier's name (longest wins).
  const supNames = new Map<string, string>();
  for (const p of products) for (const c of p.components) for (const s of c.subs) for (const x of s.suppliers) {
    const n = x.name.trim();
    if (n) supNames.set(norm(n), n);
  }
  let supKey = '';
  for (const k of supNames.keys()) if (k && ` ${q} `.includes(` ${k} `) && k.length > supKey.length) supKey = k;
  if (supKey) {
    const display = supNames.get(supKey)!;
    const hits: SupplierHit[] = [];
    for (const p of products) for (const c of p.components) for (const s of c.subs) {
      const sel = selectedSupplier(s);
      for (const x of s.suppliers) {
        if (norm(x.name) !== supKey) continue;
        hits.push({ sku: p.sku, component: c.name.trim(), sub: s.name.trim(),
          qty: num(s.qty), unit: s.unit, materialCode: x.materialCode.trim(), rate: num(x.rate), selected: x === sel });
      }
    }
    return { kind: 'supplier', name: display, hits };
  }

  // 3. Item: the non-filler words name a sub-component (fuzzy). "fabric
  //    salsa" matches sub "Salsa" under component "Fabric" because component
  //    tokens count toward the match too.
  const termTok = qTok.filter(t => !FILLER.has(t));
  const term = termTok.join(' ');
  if (!term) return { kind: 'none', hint: 'Name the material, supplier or SKU you are asking about — e.g. "cost of fabric salsa", "what do we buy from Arvachin", "DRS210 cost"' };
  const scored: { score: number; hit: ItemHit }[] = [];
  for (const p of products) for (const c of p.components) for (const s of c.subs) {
    const subN = norm(s.name);
    const bothTok = new Set([...tokens(s.name), ...tokens(c.name)]);
    let score = 0;
    if (subN === term) score = 4;
    else if (subN && (subN.includes(term) || term.includes(subN))) score = 3;
    else if (termTok.every(t => bothTok.has(t))) score = 2;
    else if (termTok.some(t => bothTok.has(t) && !tokens(c.name).includes(t))) score = 1;
    if (score === 0) continue;
    const sel = selectedSupplier(s);
    scored.push({ score, hit: {
      sku: p.sku, component: c.name.trim(), sub: s.name.trim(),
      qty: num(s.qty), unit: s.unit, cost: subCost(s),
      suppliers: s.suppliers.filter(x => x.name.trim()).map(x => supRow(x, x === sel)),
    } });
  }
  if (scored.length === 0) {
    return { kind: 'none', hint: `Nothing called "${term}" on any product costing — check the spelling, or ask by supplier or SKU` };
  }
  // Keep every SOLID match (score >= 2: exact, substring, or all words
  // present) - "Salsa" and "Salsa 60\"" must both answer "fabric salsa".
  // Weak single-word overlaps (score 1) only surface when nothing solid did.
  const solid = scored.filter(x => x.score >= 2);
  const pool = (solid.length ? solid : scored).sort((a, b) => b.score - a.score);
  return { kind: 'item', term, hits: pool.map(x => x.hit).slice(0, 12) };
}
