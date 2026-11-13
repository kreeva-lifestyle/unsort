// Products waiting as copies of ones added earlier (pre-launch fix D18): how
// many there are, and "archive them together". The server archives them as a
// bulk change (pb-products copies.ts), so Settings → Bulk changes can take it
// back for 7 days. Errors are thrown as-is; callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';

/** archived: copies with nothing of their own · priced: left, they came with a vendor price the earlier product
 *  lacks or contradicts · on_site: left, a listing of them is already on a website. */
export interface CopyCounts { archived: number; priced: number; on_site: number }

/** What archiving the copies would do right now: every held copy judged as things stand (pb_copies_archive with
 *  apply = false). Nothing changes. The three numbers together are how many products wait as a copy. */
export async function previewCopies(): Promise<CopyCounts> {
  const { data, error } = await supabase.rpc('pb_copies_archive', { p_apply: false });
  if (error) throw error;
  const d = (data ?? {}) as Partial<CopyCounts>;
  return { archived: Number(d.archived) || 0, priced: Number(d.priced) || 0, on_site: Number(d.on_site) || 0 };
}

/** Archive the copies that have nothing of their own. `run_id`: the bulk change it was logged as (null when none was archived). */
export const archiveCopies = () => pbCall<CopyCounts & { run_id: string | null }>('copies_archive');
