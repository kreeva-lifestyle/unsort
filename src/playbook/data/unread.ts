// Products the AI reader gave up on: Needs info, still carrying the reader's
// error (three real failures; a busy AI no longer counts as one). How many
// there are, and "read them all again" (reread_failed, pb-products bulk.ts).
import { supabase } from '../../lib/supabase';
import { pbCall } from './pbFunctions';

export async function unreadCount(): Promise<number> {
  const { count, error } = await supabase.from('pb_products').select('id', { count: 'exact', head: true }).eq('status', 'needs_info').not('ai_error', 'is', null);
  if (error) throw error;
  return count ?? 0;
}

/** Back in the queue: the automation reads them again a few at a time. */
export const rereadFailed = () => pbCall<{ queued: number }>('reread_failed');
