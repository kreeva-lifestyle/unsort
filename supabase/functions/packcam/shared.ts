// packcam shared helpers: database access with the service role, secrets
// and settings, hashing/signing, caller checks, and the Dropbox token.
// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svc = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };
const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173'];
export const cors = (req: Request) => {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-packcam-agent',
  };
};
export const json = (b: unknown, req: Request, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors(req), 'content-type': 'application/json' } });
export const fail = (status: number, error: string, req: Request) => json({ ok: false, error }, req, status);

export const DEFAULT_SETTINGS = {
  enabled: false,
  targets: { pc: true, dropbox: false, gdrive: false },
  pc_folder: '',
  dropbox_folder: '/PackCam',
  gdrive_folder_name: 'PackCam',
  max_clip_seconds: 600,
  pre_roll_seconds: 5,
  post_roll_seconds: 3,
  buffer_hours: 6,
};

export async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.prefer ? { prefer: init.prefer } : {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status} ${path.split('?')[0]}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
export const secret = async (key: string): Promise<string | null> => (await rest(`app_secrets?key=eq.${encodeURIComponent(key)}&select=value`))?.[0]?.value ?? null;
export const setSecret = (key: string, value: string) => rest('app_secrets', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]) });
export const setting = async (key: string): Promise<any> => (await rest(`app_settings?key=eq.${encodeURIComponent(key)}&select=value`))?.[0]?.value ?? null;
export const putSetting = (key: string, value: unknown) => rest('app_settings', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]) });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
export async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
/** Constant-time compare of two hex strings. */
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export async function caller(req: Request): Promise<{ id: string; role: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const prof = (await rest(`profiles?id=eq.${user.id}&select=role,is_active`))?.[0];
  if (!prof || prof.is_active === false) return null;
  return { id: user.id, role: prof.role ?? '' };
}

export async function agentOk(req: Request): Promise<boolean> {
  const key = req.headers.get('x-packcam-agent') || '';
  if (key.length < 20) return false;
  const stored = await secret('packcam_agent_token_hash');
  return !!stored && same(await sha256(key), stored);
}

export async function playSecret(): Promise<string> {
  let s = await secret('packcam_play_secret');
  if (!s) { s = randomHex(32); await setSecret('packcam_play_secret', s); }
  return s;
}

// The Dropbox access token is cached (app_secrets.packcam_dropbox_access) and
// reused until 30 minutes before it expires, instead of a refresh on every
// 5-second poll against the Dropbox app other features share.
// The cache remembers which Dropbox login made it (a fingerprint of the
// refresh token): reconnecting Dropbox makes the next call refresh, and
// forgetDropboxToken() drops a token Dropbox has refused.
export async function dropboxToken(): Promise<{ access_token: string; expires_in: number } | { error: string }> {
  const [rt, ck, cs] = await Promise.all([secret('dropbox_refresh_token'), secret('dropbox_app_key'), secret('dropbox_app_secret')]);
  if (!rt || !ck || !cs) return { error: 'Dropbox is not connected — connect it in Minis → Dropbox' };
  const fp = (await sha256(rt)).slice(0, 16);
  try {
    const c = JSON.parse((await secret('packcam_dropbox_access')) || 'null');
    if (c?.token && c.fp === fp && c.exp - Date.now() > 30 * 60_000) return { access_token: c.token, expires_in: Math.floor((c.exp - Date.now()) / 1000) };
  } catch { /* refresh below */ }
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: ck, client_secret: cs }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `Dropbox token ${r.status}: ${d.error_description || d.error || 'unknown'}` };
  const expiresIn = Number(d.expires_in) || 14000;
  await setSecret('packcam_dropbox_access', JSON.stringify({ token: d.access_token, exp: Date.now() + expiresIn * 1000, fp }));
  return { access_token: d.access_token, expires_in: expiresIn };
}
export const forgetDropboxToken = () => setSecret('packcam_dropbox_access', 'null');
