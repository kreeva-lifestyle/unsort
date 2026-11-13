// Products waiting as copies of ones added earlier (pre-launch fix D18): how
// many there are, and "archive them together". The server does it as a bulk
// change (pb-products copies.ts), so Settings → Bulk changes can take it back
// for 7 days. Errors are thrown as-is; callers show them with friendlyError().
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';

/** archived: copies with nothing of their own · priced: left, they came with a vendor price the earlier product
 *  lacks or contradicts · on_site: left, a listing of them is already on a website. */
export interface CopyCounts { archived: number; priced: number; on_site: number }

/** Products the Ready gate holds as a copy (pb_products.copy_of, which the gate itself keeps). */
export async function copiesCount(): Promise<number> {
  const { count, error } = await supabase.from('pb_products').select('id', { count: 'exact', head: true }).eq('status', 'needs_info').not('copy_of', 'is', null);
  if (error) throw error;
  return count ?? 0;
}

/** What archiving them would do right now. Nothing changes. */
export const previewCopies = () => pbCall<CopyCounts>('copies_preview');
/** Archive the copies that have nothing of their own. `run_id`: the bulk change it was logged as (null when none was archived). */
export const archiveCopies = () => pbCall<CopyCounts & { run_id: string | null }>('copies_archive');
