// The saved SKU map for Indya Import: the design code as Indya has it →
// the correct code, kept in Supabase (indya_sku_map) so a spelling fix is
// typed once and applied on every run — the SKU sheet for vendors, the
// stock lookup, the results. Codes only, never a size (owner's rule): one
// entry fixes every size of that product. The pure parts (toCorrections,
// mergeEntries, isCodeOnly) are harness-tested; the Supabase calls are thin.
import { supabase } from '../../../lib/supabase';
import { normKey, shapeKey, isCodeOnly } from './indyaSku';
import type { Corrections } from './indyaFiles';
import type { IndyaSkuMap } from '../../../types/database';

export type MapRow = Pick<IndyaSkuMap, 'id' | 'wrong' | 'correct' | 'note'>;
export interface MapEntry { wrong: string; correct: string; note?: string | null }
export const MAP_LIMIT = 5000;
export const CODE_ONLY_MSG = 'Enter the code only, without a size — e.g. TF-343';

/** Validate one entry; returns the problem or null. Both sides upper-cased. */
export function checkEntry(wrong: string, correct: string): string | null {
  const w = normKey(wrong), c = normKey(correct);
  if (!w || !c) return 'Both the code Indya sent and the correct code are needed';
  if (!isCodeOnly(w) || !isCodeOnly(c)) return CODE_ONLY_MSG;
  if (w === c) return 'The two codes are the same — nothing to fix';
  return null;
}

/** Pure merge: later entries win on the same code (case/space-insensitive). */
export function mergeEntries(existing: MapEntry[], incoming: MapEntry[]): MapEntry[] {
  const m = new Map<string, MapEntry>();
  for (const e of [...existing, ...incoming]) m.set(normKey(e.wrong), { wrong: normKey(e.wrong), correct: normKey(e.correct), note: e.note ?? null });
  return [...m.values()];
}

/** The map as the Corrections object compute and the SKU sheet consume:
 *  by the code as sent (strict) and by its shape (dashes unreliable). */
export function toCorrections(rows: MapEntry[], name = 'SKU map'): Corrections {
  const byVendor = new Map<string, string>(), byShape = new Map<string, string>();
  for (const r of rows) {
    const w = normKey(r.wrong), c = normKey(r.correct);
    if (!w || !c) continue;
    byVendor.set(w, c); byShape.set(shapeKey(w), c);
  }
  return { name, bySku: new Map(), byVendor, byShape, count: byVendor.size };
}

export async function loadSkuMap(): Promise<MapRow[]> {
  const { data, error } = await supabase.from('indya_sku_map').select('id, wrong, correct, note').order('wrong').limit(MAP_LIMIT);
  if (error) throw error;
  return (data as MapRow[] | null) || [];
}

/** Upsert on the normalised code; returns how many entries were written and
 *  how many were skipped for carrying a size or being empty. */
export async function upsertSkuMap(entries: MapEntry[]): Promise<{ written: number; skipped: number }> {
  const ok: MapEntry[] = [];
  let skipped = 0;
  for (const e of entries) { if (checkEntry(e.wrong, e.correct)) skipped++; else ok.push(e); }
  const rows = mergeEntries([], ok);
  const { data: { user } } = await supabase.auth.getUser();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(r => ({ wrong: r.wrong, correct: r.correct, note: r.note ?? null, created_by: user?.id ?? null, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('indya_sku_map').upsert(chunk, { onConflict: 'wrong_norm' });
    if (error) throw error;
  }
  return { written: rows.length, skipped };
}

export async function deleteSkuMap(id: string): Promise<void> {
  const { error } = await supabase.from('indya_sku_map').delete().eq('id', id);
  if (error) throw error;
}
