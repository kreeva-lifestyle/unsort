// The Product Detail Generator's edge-function call. The session token is
// required (the function checks the caller's role) and nothing secret comes
// back: the key, the model choice and the Dropbox tokens stay in the vault.
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';
import type { DetailResult } from './productDetailText';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/product-detail';

/** One generate call; the session token is required (the function checks
 *  the caller's role), so a signed-out tab gets a plain error. */
export async function generateDetail(code: string): Promise<DetailResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to DailyOffice first');
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: 'generate', code }),
  });
  const data = await r.json().catch(() => ({})) as Partial<DetailResult>;
  if (!r.ok || !data.ok) throw new Error(String(data.error || `Could not generate (${r.status})`));
  return data as DetailResult;
}
