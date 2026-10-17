// packcam — the server side of Pack Cam (packing videos for PackStation scans).
//
// Two callers:
//   * the Pack Cam agent on the office PC (tools/packcam-agent), which sends
//     the header `x-packcam-agent: <agent key>`. The key is created in
//     Settings → Pack Cam and only its sha-256 is stored
//     (app_secrets.packcam_agent_token_hash).
//       agent_poll   { cursor, status }  -> settings, cameras (with passwords),
//                    new scans since cursor, a short-lived Dropbox access
//                    token (when Dropbox is on), play secret. Also stores the
//                    agent's heartbeat (app_settings.packcam_agent).
//       agent_report { clips } -> upserts clip rows.
//   Pack Cam never deletes clips: the team clears old ones themselves.
//   * signed-in staff (Authorization: Bearer <user JWT>):
//       new_agent_key (admin) -> a fresh agent key, shown once.
//       play { clip_id }      -> a URL to watch the clip: a Dropbox temporary
//                    link, the Drive link, or a signed link to the agent's own
//                    page on the office network (PC-only clips).
// Camera passwords and the Dropbox refresh token never reach a browser.
// Gateway verify_jwt is OFF (the agent has no Supabase session); every action
// checks its own caller.

// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svc = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };
const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173'];
const cors = (req: Request) => {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-packcam-agent',
  };
};
const json = (b: unknown, req: Request, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request) => json({ ok: false, error }, req, status);

export const DEFAULT_SETTINGS = {
  enabled: false,
  targets: { pc: true, dropbox: false, gdrive: false },
  dropbox_folder: '/PackCam',
  gdrive_folder_name: 'PackCam',
  max_clip_seconds: 600,
  pre_roll_seconds: 5,
  post_roll_seconds: 3,
  buffer_hours: 6,
};

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.prefer ? { prefer: init.prefer } : {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status} ${path.split('?')[0]}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const secret = async (key: string): Promise<string | null> => (await rest(`app_secrets?key=eq.${encodeURIComponent(key)}&select=value`))?.[0]?.value ?? null;
const setSecret = (key: string, value: string) => rest('app_secrets', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]) });
const setting = async (key: string): Promise<any> => (await rest(`app_settings?key=eq.${encodeURIComponent(key)}&select=value`))?.[0]?.value ?? null;
const putSetting = (key: string, value: unknown) => rest('app_settings', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]) });

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
/** Constant-time compare of two hex strings. */
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function caller(req: Request): Promise<{ id: string; role: string } | null> {
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

async function agentOk(req: Request): Promise<boolean> {
  const key = req.headers.get('x-packcam-agent') || '';
  if (key.length < 20) return false;
  const stored = await secret('packcam_agent_token_hash');
  return !!stored && same(await sha256(key), stored);
}

async function playSecret(): Promise<string> {
  let s = await secret('packcam_play_secret');
  if (!s) { s = randomHex(32); await setSecret('packcam_play_secret', s); }
  return s;
}

// The Dropbox access token is cached (app_secrets.packcam_dropbox_access) and
// reused until 30 minutes before it expires, instead of a refresh on every
// 5-second poll against the Dropbox app other features share.
async function dropboxToken(): Promise<{ access_token: string; expires_in: number } | { error: string }> {
  try {
    const c = JSON.parse((await secret('packcam_dropbox_access')) || 'null');
    if (c?.token && c.exp - Date.now() > 30 * 60_000) return { access_token: c.token, expires_in: Math.floor((c.exp - Date.now()) / 1000) };
  } catch { /* refresh below */ }
  const [rt, ck, cs] = await Promise.all([secret('dropbox_refresh_token'), secret('dropbox_app_key'), secret('dropbox_app_secret')]);
  if (!rt || !ck || !cs) return { error: 'Dropbox is not connected — connect it in Minis → Dropbox' };
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: ck, client_secret: cs }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `Dropbox token ${r.status}: ${d.error_description || d.error || 'unknown'}` };
  const expiresIn = Number(d.expires_in) || 14000;
  await setSecret('packcam_dropbox_access', JSON.stringify({ token: d.access_token, exp: Date.now() + expiresIn * 1000 }));
  return { access_token: d.access_token, expires_in: expiresIn };
}

const CLIP_COLS = ['scan_id', 'awb', 'courier', 'camera', 'scanned_at', 'clip_start', 'clip_end', 'duration_s', 'size_bytes', 'status', 'pc_path', 'dropbox_path', 'gdrive_file_id', 'gdrive_link', 'error'];
const STATUSES = new Set(['queued', 'cutting', 'uploading', 'done', 'failed', 'missing']);
const s = (v: unknown, n = 300) => (v == null ? null : String(v).slice(0, n));

async function agentPoll(body: any, req: Request): Promise<Response> {
  const now = new Date().toISOString();
  const settings = { ...DEFAULT_SETTINGS, ...(await setting('packcam') ?? {}) };
  settings.targets = { ...DEFAULT_SETTINGS.targets, ...(settings.targets ?? {}) };
  // Heartbeat: whatever the agent says about itself, stamped with server time.
  // app_settings is in the realtime publication, so it is written once a
  // minute, or sooner when something the Settings page shows has changed.
  const status = body?.status && typeof body.status === 'object' && JSON.stringify(body.status).length < 20_000 ? body.status : {};
  const prev = await setting('packcam_agent');
  const gist = (x: any) => JSON.stringify([x?.version, x?.lan_url, x?.enabled, x?.queue, x?.dropbox, x?.gdrive, x?.last_error, (x?.cameras ?? []).map((c: any) => [c?.number, c?.ok, c?.error])]);
  if (!prev?.last_seen || Date.now() - Date.parse(prev.last_seen) > 60_000 || gist(prev) !== gist(status)) await putSetting('packcam_agent', { ...status, last_seen: now });

  const cams = await rest('packtime_cameras?select=id,number,is_active,ip,rtsp_port,rtsp_path,username&is_active=eq.true&ip=not.is.null&order=number');
  const pw = cams.length ? await rest(`packcam_camera_secrets?select=camera_id,password&camera_id=in.(${cams.map((c: any) => c.id).join(',')})`) : [];
  const pwBy = new Map(pw.map((p: any) => [p.camera_id, p.password]));
  const cameras = cams.map((c: any) => ({ id: c.id, number: String(c.number), ip: c.ip, rtsp_port: c.rtsp_port, rtsp_path: c.rtsp_path, username: c.username, password: pwBy.get(c.id) || '' }));

  // New scans on the configured cameras since the agent's cursor (first run:
  // the last 10 minutes only — no backlog from before Pack Cam existed).
  const since = typeof body?.cursor === 'string' && !isNaN(Date.parse(body.cursor)) ? body.cursor : new Date(Date.now() - 10 * 60_000).toISOString();
  // Camera numbers are free text: quote and escape each for PostgREST, then
  // URL-encode the list so characters like & or # cannot break the query.
  const numbers = cameras.map((c: any) => `"${c.number.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  const scans = settings.enabled && cameras.length
    ? await rest(`packtime_scans?select=id,awb,courier,camera,scanned_at&scanned_at=gte.${encodeURIComponent(since)}&camera=in.(${encodeURIComponent(numbers)})&order=scanned_at.asc&limit=500`)
    : [];

  const dropbox = settings.targets.dropbox ? await dropboxToken() : null;
  return json({ ok: true, now, settings, cameras, scans, dropbox, play_secret: await playSecret() }, req);
}

async function agentReport(body: any, req: Request): Promise<Response> {
  const now = new Date().toISOString();
  const clips = (Array.isArray(body?.clips) ? body.clips : []).slice(0, 200).filter((c: any) => c && /^[0-9a-f-]{36}$/.test(String(c.scan_id)) && c.awb && c.camera && c.scanned_at && STATUSES.has(c.status));
  if (clips.length) {
    const rows = clips.map((c: any) => {
      const r: any = { updated_at: now };
      for (const k of CLIP_COLS) if (k in c) r[k] = k === 'error' ? s(c[k], 500) : c[k];
      return r;
    });
    // One shape for the bulk upsert: every row carries every column.
    const keys: string[] = [...new Set<string>(rows.flatMap((r: any) => Object.keys(r)))];
    const uniform = rows.map((r: any) => Object.fromEntries(keys.map(k => [k, k in r ? r[k] : null])));
    await rest('packcam_clips?on_conflict=scan_id', { method: 'POST', prefer: 'resolution=merge-duplicates', body: JSON.stringify(uniform) });
  }
  return json({ ok: true, saved: clips.length }, req);
}

async function play(body: any, req: Request): Promise<Response> {
  const id = String(body?.clip_id || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail(400, 'Missing clip', req);
  const c = (await rest(`packcam_clips?id=eq.${id}&select=id,scan_id,status,pc_path,dropbox_path,gdrive_link`))?.[0];
  if (!c) return fail(404, 'Clip not found', req);
  // A clip still uploading (or whose upload failed) can already have a copy
  // worth watching — usually the PC's.
  const watchable = c.status === 'done' || ((c.status === 'uploading' || c.status === 'failed') && (c.pc_path || c.dropbox_path || c.gdrive_link));
  if (!watchable) return fail(409, 'The packing video is not ready yet', req);
  if (c.dropbox_path) {
    const t = await dropboxToken();
    if ('access_token' in t) {
      const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', { method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: c.dropbox_path }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.link) return json({ ok: true, url: d.link, source: 'dropbox' }, req);
    }
  }
  if (c.gdrive_link) return json({ ok: true, url: c.gdrive_link, source: 'gdrive', external: true }, req);
  if (c.pc_path && c.scan_id) {
    // The agent knows its clips by scan id (it never sees the clip row id).
    const agent = await setting('packcam_agent');
    if (!agent?.lan_url) return fail(503, 'This video is on the office PC, which has not checked in yet', req);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = await hmac(await playSecret(), `${c.scan_id}.${exp}`);
    return json({ ok: true, url: `${agent.lan_url.replace(/\/+$/, '')}/clip/${c.scan_id}?exp=${exp}&sig=${sig}`, source: 'pc', lan_only: true }, req);
  }
  return fail(404, 'This video is no longer stored anywhere', req);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return fail(405, 'POST only', req);
  const body = await req.json().catch(() => null);
  const action = String(body?.action || '');
  try {
    if (action === 'agent_poll' || action === 'agent_report') {
      if (!(await agentOk(req))) return fail(401, 'Agent key not accepted — create a new one in Settings → Pack Cam', req);
      return action === 'agent_poll' ? await agentPoll(body, req) : await agentReport(body, req);
    }
    const who = await caller(req);
    if (!who) return fail(401, 'Sign in to DailyOffice first', req);
    if (action === 'new_agent_key') {
      if (who.role !== 'admin') return fail(403, 'Only an admin can create the agent key', req);
      const key = `pcam_${randomHex(24)}`;
      await setSecret('packcam_agent_token_hash', await sha256(key));
      await rest('audit_log', { method: 'POST', body: JSON.stringify({ module: 'packcam', action: 'AGENT_KEY', details: 'New Pack Cam agent key created (the old one stops working)', user_id: who.id }) });
      return json({ ok: true, key }, req);
    }
    if (action === 'play') return await play(body, req);
    return fail(400, 'Unknown action', req);
  } catch (e) {
    return fail(500, String((e as Error)?.message || e).slice(0, 300), req);
  }
});
