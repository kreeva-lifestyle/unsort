// "Was this product already added?" (owner, 2026-11-12): what the database
// judged for a product (20261112150000_pb_duplicates.sql) and the answers a
// person gives. Records are linked, never merged: an answer can be changed by
// answering again. Also where a product came from, as words for the list.
// Errors are thrown as-is; callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { logPbActivity } from './listings';

/** held: this product looks like a copy of `other` (added first; the Ready gate holds it) · original: `other`
 *  came later and is held as a copy of this one · colour: another colour of the same design · maybe: a
 *  suggestion to answer · different: a person said they are different. */
export type DupKind = 'held' | 'original' | 'colour' | 'maybe' | 'different';
/** Why they were matched: the same design code at the same supplier · the same code at another supplier ·
 *  the same number with other letters (KB 25 / NKB 25) · the same photo. */
export type DupHow = 'code' | 'other_vendor' | 'near_code' | 'photo';
export type DupVerdict = 'same' | 'colour' | 'different';

export interface DupMatch {
  product_id: string; other_id: string; kind: DupKind; how: DupHow;
  other_name: string | null; other_sku: string | null; other_color: string | null;
  other_source: string; other_ref: string | null; other_status: string; other_created: string; other_photo: string | null;
}

export async function getDupMatches(ids: string[]): Promise<DupMatch[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc('pb_dup_matches', { p_ids: ids });
  if (error) throw error;
  return (data ?? []) as DupMatch[];
}

/** One answer for this product against every product in `others`, and what follows, in one step on the
 *  server (pb_dup_answer): "same" archives THIS product; "colour" / "different" re-apply the Ready gate, so a
 *  held product is let go. Returns the product's status before and after. */
export async function answerDup(productId: string, others: string[], verdict: DupVerdict): Promise<{ status: string; was: string } | null> {
  const { data, error } = await supabase.rpc('pb_dup_answer', { p_id: productId, p_others: others, p_verdict: verdict });
  if (error) throw error;
  if (verdict === 'same') logPbActivity({ product_id: productId, action: 'archived', details: { status: 'archived', copy_of: others[0] } });
  return (data as { status: string; was: string }[] | null)?.[0] ?? null;
}

/** What to call the other product in a sentence: its code, else its name. */
export const dupName = (m: Pick<DupMatch, 'other_sku' | 'other_name'>) => m.other_sku || m.other_name || 'another product';

/** For the list: which of these Needs-info products are held as a copy, and of what ("KB 264 WINE XS"). */
export async function heldLabels(rows: { id: string; status: string }[]): Promise<Record<string, string>> {
  const ids = rows.filter(r => r.status === 'needs_info').map(r => r.id);
  const out: Record<string, string> = {};
  for (const m of await getDupMatches(ids)) if (m.kind === 'held' && !out[m.product_id]) out[m.product_id] = dupName(m);
  return out;
}

/** Where a product came from, in a word or two: "Telegram", the website it was copied from, or '' when typed in. */
export function sourceText(source: string, ref: string | null | undefined): string {
  if (source === 'telegram') return 'Telegram';
  if (source === 'import') return (ref?.split(':')[0] || 'a website').replace(/^www\./, '');
  return '';
}

/** The choices of the Source filter: Telegram, typed in, and every website products were copied from. */
export async function listSources(): Promise<{ v: string; label: string }[]> {
  const { data, error } = await supabase.from('pb_import_runs').select('host').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const hosts = [...new Set((data ?? []).map(r => String(r.host || '').replace(/^www\./, '')).filter(Boolean))].sort();
  return [{ v: 'telegram', label: 'Telegram' }, { v: 'manual', label: 'Typed in' }, ...hosts.map(h => ({ v: `import:${h}`, label: h }))];
}
