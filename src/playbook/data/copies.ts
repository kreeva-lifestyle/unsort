// Products waiting as copies of ones added earlier (pre-launch fix D18): how
// many there are, and "archive them together". The server archives them as a
// bulk change (pb-products copies.ts), so Settings → Bulk changes can take it
// back for 7 days. Errors are thrown as-is; callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';

/** archived: copies with nothing of their own · left for a person — priced: it came with a vendor price the earlier
 *  product lacks or contradicts · on_site: a listing of it is already on a website · linked: it is part of a chain
 *  (it copies a product that is itself waiting as a copy, or another waiting copy points at it). */
export interface CopyCounts { archived: number; priced: number; on_site: number; linked: number }
/** How many copies a count leaves for a person to open. */
export const leftOver = (c: Pick<CopyCounts, 'priced' | 'on_site' | 'linked'>) => c.priced + c.on_site + c.linked;

/** How many products wait as a copy, from the note the Ready gate keeps on each (pb_products.copy_of). One cheap
 *  count: the list asks it on every load, so it must not judge every copy afresh. */
export async function countCopies(): Promise<number> {
  const { count, error } = await supabase.from('pb_products').select('id', { count: 'exact', head: true })
    .eq('status', 'needs_info').not('copy_of', 'is', null);
  if (error) throw error;
  return count ?? 0;
}

/** What archiving the copies would do right now: every held copy judged as things stand (pb_copies_archive with
 *  apply = false). Nothing changes. Asked when "Archive the copies" is tapped, not on every list load. */
export async function previewCopies(): Promise<CopyCounts> {
  const { data, error } = await supabase.rpc('pb_copies_archive', { p_apply: false });
  if (error) throw error;
  const d = (data ?? {}) as Partial<CopyCounts>;
  return { archived: Number(d.archived) || 0, priced: Number(d.priced) || 0, on_site: Number(d.on_site) || 0, linked: Number(d.linked) || 0 };
}

/** Archive the copies that have nothing of their own (and clear the notes that no longer hold). `run_id`: the bulk
 *  change it was logged as (null when none was archived). */
export const archiveCopies = () => pbCall<CopyCounts & { run_id: string | null }>('copies_archive');
