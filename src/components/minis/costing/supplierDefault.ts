// "Change vendor" in Raise POs (owner's ask, 2026-10-31): when a line has
// alternate suppliers on the costing, picking one makes it the sheet's
// default (selected) supplier — on screen AND in the saved costing, so the
// next plan / PO starts from it. The saved row is changed by matching names
// (component → sub-component → supplier) on a fresh read, so unsaved edits on
// screen are never written by this.
import { supabase } from '../../../lib/supabase';
import type { CostingComponent } from './costingModel';

const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/** The components with supplier k of component ci / sub si as the only selected one. */
export const withDefault = (comps: CostingComponent[], ci: number, si: number, k: number): CostingComponent[] =>
  comps.map((c, i) => i !== ci ? c : {
    ...c, subs: c.subs.map((s, j) => j !== si ? s : { ...s, suppliers: s.suppliers.map((x, n) => ({ ...x, selected: n === k })) }),
  });

/** Make `supplier` the default for that sub-component in the SAVED costing. */
export async function saveDefaultSupplier(costingId: string, comp: string, sub: string, supplier: string): Promise<unknown> {
  const { data, error } = await supabase.from('costing_products').select('components').eq('id', costingId).maybeSingle();
  if (error) return error;
  const comps = ((data as { components: CostingComponent[] } | null)?.components) ?? [];
  const ci = comps.findIndex(c => same(c.name, comp) && c.subs.some(s => same(s.name, sub)));
  const si = ci < 0 ? -1 : comps[ci].subs.findIndex(s => same(s.name, sub));
  const k = si < 0 ? -1 : comps[ci].subs[si].suppliers.findIndex(x => same(x.name, supplier));
  if (k < 0) return new Error(`${supplier} is not saved on this costing yet — save the costing first`);
  const { error: upErr } = await supabase.from('costing_products')
    .update({ components: withDefault(comps, ci, si, k), updated_at: new Date().toISOString() }).eq('id', costingId);
  return upErr ?? null;
}
