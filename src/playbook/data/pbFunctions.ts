// Calls to Playbook's edge functions: pb-products (actions: docs/playbook/product-directory-spec.md)
// and pb-telegram (Settings → Telegram). Shared by every Playbook page. Errors come back as
// thrown Error(<plain sentence>) — show them with friendlyError().
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { PB_BUCKET } from '../types';

export type PbFunction = 'pb-products' | 'pb-telegram';

/** POST {action, ...body} to a Playbook edge function as the signed-in user. */
export async function pbFnCall<T = Record<string, unknown>>(fn: PbFunction, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to continue');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await r.json().catch(() => ({ error: `The Playbook server answered ${r.status}` }));
  // The reply rides on the error (`data`), e.g. a 409's look-alike matches (data/tags.ts).
  if (!r.ok || out?.error) throw Object.assign(new Error(out?.error || `The Playbook server answered ${r.status}`), { status: r.status, data: out });
  return out as T;
}

export const pbCall = <T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}) => pbFnCall<T>('pb-products', action, body);

/** Public URL of a product photo (the bucket is public so Shopify can fetch it). */
export const pbImageUrl = (path: string) => supabase.storage.from(PB_BUCKET).getPublicUrl(path).data.publicUrl;

/** Shopify admin link for a listing's product id (gid://shopify/Product/123 → …/products/123). */
export const shopifyAdminUrl = (shopDomain: string, gid: string | null) =>
  gid ? `https://${shopDomain}/admin/products/${gid.split('/').pop()}` : null;
