// PostgREST access with the service role (RLS is bypassed on purpose: this
// function does its own auth in auth.ts). Every failure becomes an HttpError
// with a plain sentence.
import { HttpError } from './http.ts';
import type { Settings } from './types.ts';

export const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const svcHeaders: Record<string, string> = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };

export const enc = encodeURIComponent;
/** ISO time `ms` milliseconds ago (for "claimed more than 5 minutes ago" filters). */
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const nowIso = () => new Date().toISOString();

async function dbFail(r: Response, what: string): Promise<never> {
  const body = await r.json().catch(() => ({})) as { message?: string };
  throw new HttpError(502, `The database ${what} (${r.status}${body?.message ? `: ${String(body.message).slice(0, 160)}` : ''}).`);
}

/** GET /rest/v1/<path> → rows. `path` is "<table>?select=…&filters". */
export async function sel<T>(path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: svcHeaders });
  if (!r.ok) return dbFail(r, 'could not be read');
  return await r.json() as T[];
}

export async function one<T>(path: string): Promise<T | null> {
  return (await sel<T>(path.includes('limit=') ? path : `${path}&limit=1`))[0] ?? null;
}

/** PATCH rows matching `filter`; returns the rows that changed (empty = nothing matched — a lost claim). */
export async function patch<T>(table: string, filter: string, body: Record<string, unknown>, select = 'id'): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}&select=${select}`, {
    method: 'PATCH',
    headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return dbFail(r, 'refused the change');
  return await r.json() as T[];
}

/** INSERT (or upsert with `onConflict` + merge / ignore). Returns the written rows. */
export async function insert<T>(table: string, rows: Record<string, unknown>[], opts: { select?: string; onConflict?: string; mode?: 'merge' | 'ignore' } = {}): Promise<T[]> {
  const q = [`select=${opts.select || 'id'}`, ...(opts.onConflict ? [`on_conflict=${opts.onConflict}`] : [])].join('&');
  const prefer = ['return=representation', ...(opts.mode === 'merge' ? ['resolution=merge-duplicates'] : opts.mode === 'ignore' ? ['resolution=ignore-duplicates'] : [])];
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${q}`, {
    method: 'POST',
    headers: { ...svcHeaders, 'content-type': 'application/json', prefer: prefer.join(',') },
    body: JSON.stringify(rows),
  });
  if (r.status === 409) throw new HttpError(409, 'That record already exists.');
  if (!r.ok) return dbFail(r, 'refused the new record');
  return await r.json() as T[];
}

export async function getSecret(key: string): Promise<string | null> {
  const row = await one<{ value: string }>(`app_secrets?key=eq.${enc(key)}&select=value`).catch(() => null);
  return row?.value ?? null;
}

/** Trimmed, non-empty, first spelling kept for names that differ only in case. */
export function uniqueCi(list: string[]): string[] {
  const seen = new Set<string>();
  return list.map(c => c.replace(/\s+/g, ' ').trim()).filter(c => c && !seen.has(c.toLowerCase()) && !!seen.add(c.toLowerCase()));
}

export async function getSettings(): Promise<Settings> {
  const rows = await sel<{ key: string; value: unknown }>('pb_settings?select=key,value');
  const m = new Map(rows.map(r => [r.key, r.value]));
  const reader = (m.get('reader') || {}) as { model?: string; effort?: string };
  const cats = m.get('categories');
  const auto = (m.get('automation') || {}) as { paused?: boolean };
  return {
    reader: { model: String(reader.model || ''), effort: String(reader.effort || '') },
    categories: uniqueCi(Array.isArray(cats) ? cats.map(c => String(c ?? '')) : []),
    automation: { paused: auto.paused === true },
  };
}

/** POST /rest/v1/rpc/<fn> → its result (service role). */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...svcHeaders, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) {
    const body = await r.json().catch(() => ({})) as { message?: string; code?: string };
    // Our own `raise exception` sentences (pb_tag_merge…, SQLSTATE P0001) are shown as they are.
    if (body?.code === 'P0001' && body.message) throw new HttpError(400, String(body.message).slice(0, 200));
    return dbFail(r, 'refused the change');
  }
  return await r.json() as T;
}

/** Timeline entry. Written after the change it describes; a failed log write is reported in the
 *  function logs but never undoes the work it describes. */
export async function logActivity(a: { product_id?: string | null; website_id?: string | null; listing_id?: string | null; action: string; details?: Record<string, unknown>; user_id?: string | null }) {
  try {
    await insert('pb_activity', [{ product_id: a.product_id ?? null, website_id: a.website_id ?? null, listing_id: a.listing_id ?? null, action: a.action, details: a.details ?? {}, user_id: a.user_id ?? null }]);
  } catch (e) {
    console.error('pb_activity write failed', a.action, e instanceof Error ? e.message : e);
  }
}

/** Public URL of a photo in the playbook-products bucket (Shopify and Claude fetch it). */
export const publicUrl = (path: string) =>
  `${SB_URL}/storage/v1/object/public/playbook-products/${path.split('/').map(enc).join('/')}`;
