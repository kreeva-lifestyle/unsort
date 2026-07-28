// Edge-function caller for Client Finder. Sends the user's session token, not
// the bare anon key: the server identifies the caller to enforce the per-user
// daily cap, and an anon key has no user to count against.
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/client-finder';

export type MatchKind = 'full' | 'partial' | 'page';

export interface Hit {
  domain: string;
  url: string;
  page_title: string | null;
  match_kind: MatchKind;
  score: number | null;
}

/** A Dropbox folder offered when one SKU exists in several of them. Same shape
 *  the Dropbox Link Generator already uses (dropboxlinks/api.ts). */
export interface FolderCandidate { name: string; path: string; display: string }

export interface SearchResult {
  ok: boolean;
  cached?: boolean;
  search_id?: string;
  best_guess?: string | null;
  entities?: string[];
  hits?: Hit[];
  used?: number;
  cap?: number;
  error?: string;
  details?: string;
  /** The SKU sits in more than one Dropbox folder — not an error, a question.
   *  `candidates` are the folders to choose between. */
  needsFolder?: boolean;
  candidates?: FolderCandidate[];
}

// How confident a hit is, in words rather than jargon.
export const kindLabel: Record<MatchKind, string> = {
  full: 'Exact image',
  partial: 'Cropped or edited',
  page: 'Listed by Google',
};

export const call = async (body: object): Promise<{ status: number; data: SearchResult }> => {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({ ok: false } as SearchResult)) };
};

// Server messages here are already written for people ("Daily limit reached -
// 25 searches per person per day"), so show them verbatim rather than
// flattening them into a generic failure.
export const explain = (data: SearchResult, status: number): string =>
  String(data?.details || data?.error || '').trim() || `Search failed (${status})`;

// Read a picked File as base64 for the edge function. FileReader (not
// arrayBuffer + btoa) because a spread over a photo-sized byte array
// overflows the call stack on larger phone photos.
export const fileToB64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Could not read that file'));
    fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^;]+;base64,/, ''));
    fr.readAsDataURL(file);
  });
