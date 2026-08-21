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

export const blankSupplier = (): CostingSupplier => ({ name: '', materialCode: '', rate: '', selected: true });
export const blankSub = (): CostingSub => ({ name: '', qty: '', unit: '', suppliers: [blankSupplier()] });
export const blankComponent = (): CostingComponent => ({ name: '', subs: [blankSub()] });

/** Owner's rule: main component, sub component, supplier, qty, unit and rate
 *  are compulsory. Returns human-readable problems, empty when saveable. */
export function validateSheet(sku: string, components: CostingComponent[]): string[] {
  const errs: string[] = [];
  if (!sku.trim()) errs.push('SKU is required');
  if (components.length === 0) errs.push('Add at least one main component');
  components.forEach((c, ci) => {
    const cn = c.name.trim() || `Main component ${ci + 1}`;
    if (!c.name.trim()) errs.push(`Main component ${ci + 1}: name is required`);
    if (c.subs.length === 0) errs.push(`${cn}: add at least one sub component`);
    c.subs.forEach((s, si) => {
      const sn = s.name.trim() || `sub ${si + 1}`;
      if (!s.name.trim()) errs.push(`${cn}: sub component ${si + 1} needs a name`);
      if (!(num(s.qty) > 0)) errs.push(`${cn} → ${sn}: QTY must be more than 0`);
      if (!s.unit.trim()) errs.push(`${cn} → ${sn}: pick a unit`);
      const sel = selectedSupplier(s);
      if (!sel || !sel.name.trim()) errs.push(`${cn} → ${sn}: supplier is required`);
      if (!(num(sel?.rate) > 0)) errs.push(`${cn} → ${sn}: rate must be more than 0`);
      s.suppliers.forEach((sup, pi) => {
        if (sup !== sel && sup.name.trim() && !(num(sup.rate) > 0)) {
          errs.push(`${cn} → ${sn}: alternate supplier ${pi + 1} (${sup.name.trim()}) needs a rate`);
        }
      });
    });
  });
  return errs;
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
  const mains = new Set<string>();
  const subs = new Set<string>();
  const byName = new Map<string, { name: string; materialCode: string; rate: number | string }>();
  // Newest sheet first (caller orders by updated_at desc), so the FIRST code/
  // rate seen per supplier is the most recent one — that's what autofills.
  for (const p of products) {
    for (const c of p.components) {
      if (c.name.trim()) mains.add(c.name.trim());
      for (const su of c.subs) {
        if (su.name.trim()) subs.add(su.name.trim());
        for (const x of su.suppliers) {
          const n = x.name.trim();
          if (!n) continue;
          const key = n.toUpperCase();
          if (!byName.has(key)) byName.set(key, { name: n, materialCode: x.materialCode.trim(), rate: x.rate });
        }
      }
    }
  }
  const coll = (a: string, b: string) => a.localeCompare(b);
  return {
    mains: [...mains].sort(coll),
    subs: [...subs].sort(coll),
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
