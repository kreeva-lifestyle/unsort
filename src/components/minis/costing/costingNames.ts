// One spelling per name (owner: "cups", "CUPS" and "Cups" are the same thing
// — do not save them differently). At save time every main-component, sub-
// component and supplier name snaps to the spelling that already EXISTS in
// the library (built from all sheets, newest first); a name new to the
// library stays as typed but is kept consistent WITHIN the sheet too (its
// first occurrence wins). This is what keeps the purchase plan's by-supplier
// grouping, the ask engine and the chips ranking consolidated.
import { CostingComponent, CostingLibrary } from './costingModel';

export function canonicalizeNames(components: CostingComponent[], lib: CostingLibrary): CostingComponent[] {
  const seed = (names: string[]) => new Map(names.map(n => [n.trim().toUpperCase(), n.trim()]));
  const mains = seed(lib.mains);
  const subs = seed(lib.subs);
  const sups = seed(lib.suppliers.map(s => s.name));
  const fix = (m: Map<string, string>, raw: string): string => {
    const n = raw.trim();
    if (!n) return raw;
    const hit = m.get(n.toUpperCase());
    if (hit) return hit;
    m.set(n.toUpperCase(), n);
    return n;
  };
  return components.map(c => ({
    ...c, name: fix(mains, c.name),
    subs: c.subs.map(s => ({
      ...s, name: fix(subs, s.name),
      suppliers: s.suppliers.map(x => ({ ...x, name: fix(sups, x.name) })),
    })),
  }));
}
