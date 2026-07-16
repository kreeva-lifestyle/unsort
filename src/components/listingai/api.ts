// Edge-function caller for Listing AI (mirrors dropboxlinks/api.ts). The
// edge fn authorises per caller role, so the user's session token is sent.
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/listing-ai';

export interface GenUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export interface GenRow { sku: string; status: 'ok' | 'not_in_master' | 'bad_link'; noImage?: boolean; note?: string; linkSource?: 'typed' | 'folders' | 'master' | 'search'; values: string[] }
export interface GenResponse {
  ok: boolean; error?: string; details?: string;
  headers?: string[]; kinds?: string[]; rows?: GenRow[];
  usage?: GenUsage; aiFieldCount?: number; warnings?: string[];
  model?: string;         // active generation model (owner-picked in Settings)
  estUsd?: number;        // what this chunk's AI call cost, in USD
  cacheSavedUsd?: number; // what the prompt cache saved vs full price
  messageId?: string;     // thread into the next chunk's prevMessageId (cache checkup)
  cacheNote?: string;     // plain-language cache-miss warning, when structural
}

// Live master-sheet header list (edge reads the Google Sheet) — feeds the
// "fill from master column" pairing select in the template editor.
export const fetchMasterColumns = async (): Promise<string[]> => {
  const { status, data } = await call({ action: 'master_columns' });
  if (!data?.ok) throw new Error(String(data?.details || data?.error || `Could not read the master sheet (${status})`));
  return (data.columns || []) as string[];
};

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
