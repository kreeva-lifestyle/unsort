// Edge-function caller for Listing AI (mirrors dropboxlinks/api.ts). The
// edge fn authorises per caller role, so the user's session token is sent.
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/listing-ai';

export interface GenUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export interface GenRow { sku: string; status: 'ok' | 'not_in_master'; noImage?: boolean; values: string[] }
export interface GenResponse {
  ok: boolean; error?: string; details?: string;
  headers?: string[]; kinds?: string[]; rows?: GenRow[];
  usage?: GenUsage; aiFieldCount?: number; warnings?: string[];
}

export const call = async (body: object): Promise<{ status: number; data: any }> => {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({} as any)) };
};
