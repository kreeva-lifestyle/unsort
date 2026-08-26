// Product Costing — the data shapes and arithmetic, kept pure so a harness
// can drive them without a browser.
//
// One sheet per product: SKU + photo + main components, each holding
// sub-components. A sub-component carries qty + unit and ONE OR MORE
// suppliers (name + material code + rate); exactly one supplier is SELECTED
// and its rate is the costing rate — the others are alternates the purchaser
// can see, each with its own material code (owner's spec).

export interface CostingSupplier { name: string; materialCode: string; rate: number | string; selected?: boolean }
export interface CostingSub { name: string; qty: number | string; unit: string; suppliers: CostingSupplier[] }
export interface CostingComponent { name: string; subs: CostingSub[] }
export interface CostingProduct {
  id: string; sku: string; image_url: string | null;
  maintenance_pct: number | string; components: CostingComponent[];
  notes: string;
  updated_at?: string;
}

export const UNITS = ['Meter', 'Pcs', 'Yard', 'Gram', 'Kg', 'Dozen', 'Set'];

export const num = (v: number | string | null | undefined): number => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

export const money = (n: number): string =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The supplier whose rate prices this sub-component. Falls back to the
 *  first entry so a sheet can never silently cost a sub at 0 just because
 *  no radio was ticked. */
export const selectedSupplier = (s: CostingSub): CostingSupplier | null =>
  s.suppliers.find(x => x.selected) ?? s.suppliers[0] ?? null;

export const subCost = (s: CostingSub): number =>
  num(s.qty) * num(selectedSupplier(s)?.rate);

export const componentCost = (c: CostingComponent): number =>
  c.subs.reduce((t, s) => t + subCost(s), 0);

export const sheetCost = (components: CostingComponent[]): number =>
  components.reduce((t, c) => t + componentCost(c), 0);

export const totalCost = (components: CostingComponent[], maintenancePct: number | string): number =>
  sheetCost(components) * (1 + num(maintenancePct) / 100);

/** Live per-field validity for one sub-component — drives the red borders in
 *  the editor so a zero rate or missing unit is visible while typing, not
 *  only at save. Same rules as validateSheet, per cell. */
export const subProblems = (s: CostingSub) => {
  const sel = selectedSupplier(s);
  return {
    name: !s.name.trim(),
    qty: !(num(s.qty) > 0),
    unit: !s.unit.trim(),
    supplier: !sel || !sel.name.trim(),
    rate: !(num(sel?.rate) > 0),
  };
};

/** The cheapest usable alternate to the primary supplier, when it genuinely
 *  beats the primary's rate. Powers the "cheaper supplier available"
 *  recommendation (owner's ask) - a nudge only, never an auto-switch: rate
 *  is not the whole story (quality, credit terms, availability). */
export const cheaperAlt = (s: CostingSub): { name: string; rate: number; saving: number } | null => {
  const sel = selectedSupplier(s);
  const selRate = num(sel?.rate);
  if (!sel || !(selRate > 0)) return null;
  let best: { name: string; rate: number } | null = null;
  for (const x of s.suppliers) {
    if (x === sel || !x.name.trim()) continue;
    const r = num(x.rate);
    if (r > 0 && r < selRate && (!best || r < best.rate)) best = { name: x.name.trim(), rate: r };
  }
  return best ? { ...best, saving: selRate - best.rate } : null;
};

export const blankSupplier = (): CostingSupplier => ({ name: '', materialCode: '', rate: '', selected: true });
export const blankSub = (): CostingSub => ({ name: '', qty: '', unit: '', suppliers: [blankSupplier()] });
export const blankComponent = (): CostingComponent => ({ name: '', subs: [blankSub()] });

/** One validation problem with the DOM anchor it belongs to — the editor's
 *  error list is tappable and scrolls to `target` (data-fx / element id). */
export interface SheetProblem { msg: string; target: string }

/** Owner's rule: main component, sub component, supplier, qty, unit and rate
 *  are compulsory. Returns human-readable problems, empty when saveable. */
export function validateSheetDetailed(sku: string, components: CostingComponent[]): SheetProblem[] {
  const errs: SheetProblem[] = [];
  const push = (msg: string, target: string) => errs.push({ msg, target });
  if (!sku.trim()) push('SKU is required', 'cost-f-sku');
  if (components.length === 0) push('Add at least one main component', 'cost-f-sku');
  components.forEach((c, ci) => {
    const cn = c.name.trim() || `Main component ${ci + 1}`;
    const ct = `cost-f-${ci}`;
    if (!c.name.trim()) push(`Main component ${ci + 1}: name is required`, ct);
    if (c.subs.length === 0) push(`${cn}: add at least one sub component`, ct);
    c.subs.forEach((s, si) => {
      const sn = s.name.trim() || `sub ${si + 1}`;
      const st = `cost-f-${ci}-${si}`;
      if (!s.name.trim()) push(`${cn}: sub component ${si + 1} needs a name`, st);
      if (!(num(s.qty) > 0)) push(`${cn} → ${sn}: QTY must be more than 0`, st);
      if (!s.unit.trim()) push(`${cn} → ${sn}: pick a unit`, st);
      const sel = selectedSupplier(s);
      if (!sel || !sel.name.trim()) push(`${cn} → ${sn}: supplier is required`, st);
      if (!(num(sel?.rate) > 0)) push(`${cn} → ${sn}: rate must be more than 0`, st);
      s.suppliers.forEach((sup, pi) => {
        if (sup !== sel && sup.name.trim() && !(num(sup.rate) > 0)) {
          push(`${cn} → ${sn}: alternate supplier ${pi + 1} (${sup.name.trim()}) needs a rate`, st);
        }
      });
    });
  });
  return errs;
}

export const validateSheet = (sku: string, components: CostingComponent[]): string[] =>
  validateSheetDetailed(sku, components).map(e => e.msg);

/** Drop fully-blank sub-component lines (the keyboard flow auto-adds a fresh
 *  line after each completed one — an untouched leftover must not block save)
 *  and blank-named components left with no subs. */
export function pruneBlank(components: CostingComponent[]): CostingComponent[] {
  const blankSubRow = (s: CostingSub) =>
    !s.name.trim() && !String(s.qty).trim() &&
    s.suppliers.every(x => !x.name.trim() && !x.materialCode.trim() && !String(x.rate).trim());
  return components
    .map(c => ({ ...c, subs: c.subs.filter(s => !blankSubRow(s)) }))
    .filter(c => c.name.trim() || c.subs.length > 0);
}


/** Everything ever typed on any sheet, deduped for suggestions — mains, sub
 *  names, and suppliers with the most recently used material code + rate per
 *  supplier name. "Auto save" costs nothing: sheets already store these; the
 *  library just harvests them so dropdowns can offer what exists. */
export interface CostingLibrary {
  mains: string[];
  subs: string[];
  suppliers: { name: string; materialCode: string; rate: number | string }[];
}

export function buildLibrary(products: CostingProduct[]): CostingLibrary {
  // Everything dedupes CASE-INSENSITIVELY (owner: "cups" / "CUPS" / "Cups"
  // are the same thing). Newest sheet first (caller orders by updated_at
  // desc), so the first spelling / code / rate seen is the most recent one.
  const mains = new Map<string, string>();
  const subs = new Map<string, string>();
  const byName = new Map<string, { name: string; materialCode: string; rate: number | string }>();
  const add = (m: Map<string, string>, raw: string) => { const n = raw.trim(); if (n && !m.has(n.toUpperCase())) m.set(n.toUpperCase(), n); };
  for (const p of products) {
    for (const c of p.components) {
      add(mains, c.name);
      for (const su of c.subs) {
        add(subs, su.name);
        for (const x of su.suppliers) {
          const n = x.name.trim();
          if (n && !byName.has(n.toUpperCase())) byName.set(n.toUpperCase(), { name: n, materialCode: x.materialCode.trim(), rate: x.rate });
        }
      }
    }
  }
  const coll = (a: string, b: string) => a.localeCompare(b);
  return {
    mains: [...mains.values()].sort(coll),
    subs: [...subs.values()].sort(coll),
    suppliers: [...byName.values()].sort((a, b) => coll(a.name, b.name)),
  };
}

export interface PlanLine {
  supplier: string; materialCode: string; component: string; sub: string;
  unit: string; perPc: number; totalQty: number; rate: number; cost: number;
}

/** Purchase plan for N pieces: every sub-component's qty × N, priced at the
 *  selected supplier's rate, grouped by supplier so the purchaser knows what
 *  to buy from whom. Quantities rounded UP to 2 decimals — a plan that tells
 *  you to buy slightly more fabric is right; one that comes up short is not. */
export function purchasePlan(components: CostingComponent[], pieces: number): { lines: PlanLine[]; suppliers: string[] } {
  const lines: PlanLine[] = [];
  for (const c of components) {
    for (const s of c.subs) {
      const sel = selectedSupplier(s);
      if (!sel) continue;
      const perPc = num(s.qty);
      const totalQty = Math.ceil(perPc * pieces * 100) / 100;
      const rate = num(sel.rate);
      lines.push({
        supplier: sel.name.trim() || '(no supplier)', materialCode: sel.materialCode.trim(),
        component: c.name.trim(), sub: s.name.trim(), unit: s.unit,
        perPc, totalQty, rate, cost: Math.round(totalQty * rate * 100) / 100,
      });
    }
  }
  const suppliers = [...new Set(lines.map(l => l.supplier))].sort((a, b) => a.localeCompare(b));
  return { lines, suppliers };
}
