// Calls to Playbook's edge functions: pb-products (actions: docs/playbook/product-directory-spec.md)
// and pb-telegram (Settings → Telegram). Shared by every Playbook page. Errors come back as
// thrown Error(<plain sentence>) — show them with friendlyError().
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { PB_BUCKET } from '../types';
import { plainError } from './plainError';

export type PbFunction = 'pb-products' | 'pb-telegram';

/** POST {action, ...body} to a Playbook edge function as the signed-in user. */
export async function pbFnCall<T = Record<string, unknown>>(fn: PbFunction, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw plainError('Sign in again to continue');
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await r.json().catch(() => ({ error: `The Playbook server answered ${r.status}` }));
  // The reply rides on the error (`data`), e.g. a 409's look-alike matches (data/tags.ts). The server's own
  // sentences are marked `plain` so friendlyError() shows them whole. Not marked: a bare 500, and a database
  // error it passes on ("The database refused the change (409: duplicate key…)"), which friendlyError() words.
  if (!r.ok || out?.error) {
    const own = typeof out?.error === 'string' && r.status !== 500 && !out.error.startsWith('The database ');
    throw Object.assign(new Error(out?.error || `The Playbook server answered ${r.status}`), { status: r.status, data: out, plain: own });
  }
  return out as T;
}

export const pbCall = <T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}) => pbFnCall<T>('pb-products', action, body);

/** Public URL of a product photo (the bucket is public so Shopify can fetch it). */
export const pbImageUrl = (path: string) => supabase.storage.from(PB_BUCKET).getPublicUrl(path).data.publicUrl;

/** A small copy of a product photo for a box `w` CSS px wide, at twice that for sharp phone screens
 *  (Supabase image resizing; WebP where the browser takes it). An original is 0.5 to 2 MB; measured on a
 *  2.2 MB photo, this is 4 KB for a list row and about 100 KB for the product page, so a page of 25
 *  products costs a phone on shop Wi-Fi about 0.1 MB instead of about 20 MB.
 *  The whole photo comes back (fitted inside 2w × 3w, tall enough for any portrait garment photo) and the
 *  page crops it with object-fit as before. With `h`, it is fitted inside w × h (the viewer). Asking for a
 *  width alone is no good: the server then sends a much bigger file (71 KB instead of 4 KB, measured). */
export const pbPhotoUrl = (path: string, w: number, h = w * 1.5) =>
  supabase.storage.from(PB_BUCKET).getPublicUrl(path, {
    transform: { width: Math.min(2500, Math.round(w * 2)), height: Math.min(2500, Math.round(h * 2)), resize: 'contain', quality: 70 },
  }).data.publicUrl;

/** onError for a resized photo: try the original once (resizing switched off, or a format it cannot read),
 *  then hand over to `broken` (if given). */
export const photoFallback = (path: string, broken?: () => void) => (e: { currentTarget: HTMLImageElement }) => {
  const img = e.currentTarget;
  if (img.dataset.original === '1') { broken?.(); return; }
  img.dataset.original = '1';
  img.src = pbImageUrl(path);
};

/** Shopify admin link for a listing's product id (gid://shopify/Product/123 → …/products/123). */
export const shopifyAdminUrl = (shopDomain: string, gid: string | null) =>
  gid ? `https://${shopDomain}/admin/products/${gid.split('/').pop()}` : null;
