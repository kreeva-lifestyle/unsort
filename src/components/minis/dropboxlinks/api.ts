// Shared edge-function caller for the Dropbox Link Generator. Sensitive
// actions are authorised per caller role server-side, so send the user's
// session token (the bare anon key is rejected for them).
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';
import { friendlyError } from '../../../lib/friendlyError';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';

export interface GenLink { name: string; url: string; error?: string }
export interface GenCandidate { name: string; path: string; display: string }
export interface GenResult { ok: boolean; sku: string; mode?: string; folder?: string; links?: GenLink[]; note?: string; error?: string; needsReconnect?: boolean; candidates?: GenCandidate[] }
export interface WriteResult { ok: boolean; error?: string; count?: number; skuCount?: number; written?: { sku: string; tab: string; cell: string }[]; notFound?: string[]; ambiguous?: string[] }

// Shared, human-first error text for a linkgen response. Server messages are
// already written for people ("No folder named…", "Found in 2 places…") — show
// them verbatim; friendlyError only covers the unknown.
export const explainGen = (data: any, status: number): string => {
  if (data?.error === 'dropbox_not_connected') return 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check.';
  if (data?.error === 'no_roots') return 'No search folders configured — open Settings and add the Dropbox folder link(s) to search inside.';
  const server = String(data?.details || data?.error || '').trim();
  return server || friendlyError(`Failed (${status})`);
};
export interface GenRoot { label: string; url: string; enabled: boolean; resolved?: boolean | null; error?: string; path?: string }

// Fast, storage-free thumbnails: the edge fn streams Dropbox's pre-generated
// 256px JPEG for a public shared file link (GET, browser-cached for a day).
export const thumbUrl = (link: string) => `${FN}?thumb=${encodeURIComponent(link)}&k=${SUPABASE_ANON_KEY}`;

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
