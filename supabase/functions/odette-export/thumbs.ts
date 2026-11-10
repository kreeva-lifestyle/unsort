// Signed thumbnail links for GET ?thumb=.
//
// The thumbnail GET is a bare <img> request (no Authorization header), so it
// cannot carry a session. It used to accept the public anon key as its only
// "credential" — which meant anyone on the internet could use the business's
// Dropbox token as a thumbnail proxy. Now the server hands out the thumbnail
// URL itself, signed, next to each image link `linkgen` returns to a
// signed-in caller (one HMAC per link, no extra round trip for a grid). The
// GET checks the signature and the expiry and nothing else.
//
// Signature: HMAC-SHA256(secret, "<exp>.<link>") in hex, the same shape as
// packcam's play link. The secret is app_secrets.odette_thumb_secret
// (service-role only), created on first use. It is written with
// ignore-duplicates and read back, so two cold isolates racing on the very
// first call still agree on one secret.
//
// Expiry is bucketed: every link signed within the same 6-hour window gets the
// same `exp`, so the same photo keeps the same URL and the browser's image
// cache still hits across re-renders and re-fetches. A link is valid for 6 to
// 12 hours after it is signed.

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svc = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };

const SECRET_KEY = 'odette_thumb_secret';
const BUCKET_S = 6 * 3600;
const IMG_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
export const DROPBOX_LINK_RE = /^https:\/\/(www\.)?dropbox\.com\//i;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
/** Constant-time compare of two hex strings. */
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

let keyCache: CryptoKey | null = null;

async function readSecret(): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${SECRET_KEY}&select=value`, { headers: svc });
  if (!r.ok) throw new Error(`secret read ${r.status}`);
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value || null;
}

async function signingKey(): Promise<CryptoKey> {
  if (keyCache) return keyCache;
  let s = await readSecret();
  if (!s) {
    const fresh = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const w = await fetch(`${SB_URL}/rest/v1/app_secrets`, {
      method: 'POST',
      headers: { ...svc, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify([{ key: SECRET_KEY, value: fresh, updated_at: new Date().toISOString() }]),
    });
    if (!w.ok) throw new Error(`secret store ${w.status}`);
    s = await readSecret(); // whichever write won
    if (!s) throw new Error('thumb secret missing after write');
  }
  keyCache = await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return keyCache;
}

const mac = async (exp: number, link: string) =>
  hex(await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(`${exp}.${link}`)));

/** The query string (no leading "?") for this function's GET thumbnail of
 *  one Dropbox image link. The client prefixes the function URL. */
export async function signThumb(link: string, nowMs = Date.now()): Promise<string> {
  const exp = (Math.floor(nowMs / 1000 / BUCKET_S) + 2) * BUCKET_S;
  return `thumb=${encodeURIComponent(link)}&exp=${exp}&sig=${await mac(exp, link)}`;
}

/** Adds `thumb` to every image link a signed-in caller is about to receive.
 *  Folder links and failed links get none. The links are the product and the
 *  thumbnails a convenience: if the secret cannot be read, the links go out
 *  without `thumb` (the app then shows no preview) and the failure is logged
 *  to the function log rather than failing the whole linkgen call. */
export async function withThumbs<L extends { name: string; url: string }>(links: L[]): Promise<(L & { thumb?: string })[]> {
  const now = Date.now();
  try {
    return await Promise.all(links.map(async l =>
      l.url && IMG_RE.test(l.name) && DROPBOX_LINK_RE.test(l.url) ? { ...l, thumb: await signThumb(l.url, now) } : l));
  } catch (e) {
    console.error('odette-export: thumbnail signing failed', (e as Error)?.message || e);
    return links;
  }
}

/** True when ?thumb=&exp=&sig= is a link this server signed and it has not
 *  expired. */
export async function thumbOk(link: string, expRaw: string, sig: string): Promise<boolean> {
  if (!link || !/^\d{9,11}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const exp = Number(expRaw);
  const now = Date.now() / 1000;
  if (exp <= now || exp > now + 3 * BUCKET_S) return false;
  return same(await mac(exp, link), sig);
}
