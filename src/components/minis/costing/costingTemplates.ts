// Fast entry for Product Costing (owner's ask): a new costing is mostly the
// same lines again — stitching, cutting, lining, thread, packing, ironing,
// job work on every product, only qty and today's rate changing. So:
//   - a GARMENT TEMPLATE per main-component name (LEHANGA, BLOUSE, TOP…):
//     the newest sheet with that component donates its lines, and one tap
//     brings them all in;
//   - a SUB PRESET per material name: picking "LINING" from the suggestions
//     brings its unit, supplier, code and last rate.
// Pure — no React, no Supabase — so the harness can drive it. Nothing here
// ever overwrites a value the user typed; presets fill empty fields only.
import type { CostingProduct, CostingSub, CostingSupplier, CostingLibrary } from './costingModel';

export interface ComponentTemplate { name: string; sku: string; uses: number; subs: CostingSub[] }
export interface SubPreset { unit: string; qty: string; sku: string; suppliers: CostingSupplier[] }

const key = (s: string) => s.trim().toUpperCase();

/** Deep copy — the suppliers array included — so a template line never
 *  shares references with the sheet it came from. */
export const cloneSub = (s: CostingSub): CostingSub => ({
  name: s.name, qty: s.qty, unit: s.unit,
  suppliers: s.suppliers.map(x => ({ ...x })),
});

/** Templates and presets from every saved sheet. `products` must be newest
 *  first (the caller orders by updated_at desc), so the first sheet seen
 *  for a name is the most recent one and donates the lines. */
export function withTemplates(lib: CostingLibrary, products: CostingProduct[]): CostingLibrary {
  const tpl = new Map<string, ComponentTemplate>();
  const presets: Record<string, SubPreset> = {};
  for (const p of products) {
    for (const c of p.components) {
      const ck = key(c.name);
      const lines = c.subs.filter(s => s.name.trim());
      if (ck) {
        const t = tpl.get(ck);
        if (t) t.uses += 1;
        else if (lines.length) tpl.set(ck, { name: c.name.trim(), sku: p.sku, uses: 1, subs: lines.map(cloneSub) });
      }
      for (const s of lines) {
        const sk = key(s.name);
        if (!presets[sk]) presets[sk] = { unit: s.unit, qty: String(s.qty ?? ''), sku: p.sku, suppliers: s.suppliers.filter(x => x.name.trim()).map(x => ({ ...x })) };
      }
    }
  }
  const templates = [...tpl.values()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  return { ...lib, templates, subPresets: presets };
}

export const templateFor = (lib: CostingLibrary, name: string): ComponentTemplate | null =>
  lib.templates?.find(t => key(t.name) === key(name)) ?? null;

export const presetFor = (lib: CostingLibrary, name: string): SubPreset | null =>
  lib.subPresets?.[key(name)] ?? null;

/** Fill only what is still empty on the line: unit, suppliers (with codes
 *  and rates, selection kept), and qty — the preset's qty, else 1 when the
 *  unit is Pcs. `filled.rate` says the rate came from the preset so the UI
 *  can flag it for a check (rates move). */
export function applyPreset(sub: CostingSub, preset: SubPreset | null): { sub: CostingSub; filled: { rate: boolean } } {
  if (!preset) return { sub, filled: { rate: false } };
  const hasNamedSupplier = sub.suppliers.some(x => x.name.trim());
  const suppliers = hasNamedSupplier || preset.suppliers.length === 0
    ? sub.suppliers
    : preset.suppliers.map(x => ({ ...x }));
  const rateFilled = !hasNamedSupplier && preset.suppliers.some(x => x.selected && String(x.rate).trim() !== '');
  const unit = sub.unit.trim() ? sub.unit : preset.unit;
  const qty = String(sub.qty ?? '').trim() ? sub.qty : (preset.qty.trim() ? preset.qty : (unit === 'Pcs' ? '1' : ''));
  return { sub: { ...sub, unit, qty, suppliers }, filled: { rate: rateFilled } };
}
