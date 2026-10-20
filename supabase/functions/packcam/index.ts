// packcam — the server side of Pack Cam (packing videos for PackStation scans).
//
// Two callers:
//   * the Pack Cam agent on the office PC (tools/packcam-agent), which sends
//     the header `x-packcam-agent: <agent key>`. The key is created in
//     Settings → Pack Cam and only its sha-256 is stored
//     (app_secrets.packcam_agent_token_hash).
//       agent_poll   { cursor, status }  -> settings, cameras (with passwords),
//                    new scans received since cursor, a short-lived Dropbox access
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

import { DEFAULT_SETTINGS, agentOk, caller, cors, dropboxToken, fail, forgetDropboxToken, hmac, json, playSecret, putSetting, randomHex, rest, setSecret, setting, sha256 } from './shared.ts';

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
  // Storage counts by level only (ok / low / full): free space moves every
  // minute and is refreshed by the once-a-minute write anyway. A camera test
  // answer goes out at once — the Settings page is waiting for it.
  const levels = (st: any) => Object.entries(st && typeof st === 'object' ? st : {}).map(([k, v]: [string, any]) => [k, v?.level ?? null]);
  const gist = (x: any) => JSON.stringify([x?.version, x?.lan_url, x?.enabled, x?.queue, x?.dropbox, x?.gdrive, x?.last_error, (x?.cameras ?? []).map((c: any) => [c?.number, c?.ok, c?.error]), levels(x?.storage), x?.tests ?? null]);
  if (!prev?.last_seen || Date.now() - Date.parse(prev.last_seen) > 60_000 || gist(prev) !== gist(status)) await putSetting('packcam_agent', { ...status, last_seen: now });

  const cams = await rest('packtime_cameras?select=id,number,is_active,ip,rtsp_port,rtsp_path,username&is_active=eq.true&ip=not.is.null&order=number');
  const pw = cams.length ? await rest(`packcam_camera_secrets?select=camera_id,password&camera_id=in.(${cams.map((c: any) => c.id).join(',')})`) : [];
  const pwBy = new Map(pw.map((p: any) => [p.camera_id, p.password]));
  const cameras = cams.map((c: any) => ({ id: c.id, number: String(c.number), ip: c.ip, rtsp_port: c.rtsp_port, rtsp_path: c.rtsp_path, username: c.username, password: pwBy.get(c.id) || '' }));

  // New scans on the configured cameras since the agent's cursor (first run:
  // the last 10 minutes only — no backlog from before Pack Cam existed).
  // By received_at (when the server got the scan): a scan a phone sent late
  // after losing Wi-Fi has an earlier scanned_at, its real scan time, and
  // would fall behind the cursor. Agents before 1.4.0 keep their cursor by
  // scanned_at, which is never later than received_at, so they still see
  // every scan (late ones too; duplicates are dropped by id).
  const since = typeof body?.cursor === 'string' && !isNaN(Date.parse(body.cursor)) ? body.cursor : new Date(Date.now() - 10 * 60_000).toISOString();
  // Camera numbers are free text: quote and escape each for PostgREST, then
  // URL-encode the list so characters like & or # cannot break the query.
  const numbers = cameras.map((c: any) => `"${c.number.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  // Sent even while recording is off: on the poll that switches it off, the
  // agent still takes the scans made in the last few seconds before it.
  const scans = cameras.length
    ? await rest(`packtime_scans?select=id,awb,courier,camera,scanned_at,received_at&received_at=gte.${encodeURIComponent(since)}&camera=in.(${encodeURIComponent(numbers)})&order=received_at.asc&limit=500`)
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
  // A Dropbox problem (login, outage) is said as such if no other copy can
  // be offered; only "file not found" means the video was removed.
  let dropboxProblem = '';
  if (c.dropbox_path) {
    const t = await dropboxToken();
    if ('access_token' in t) {
      const r = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', { method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: c.dropbox_path }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.link) return json({ ok: true, url: d.link, source: 'dropbox' }, req);
      if (r.status === 401) await forgetDropboxToken();
      if (!(r.status === 409 && /not_found/.test(String(d?.error_summary || '')))) dropboxProblem = `Dropbox did not answer (${r.status}) — try again in a minute`;
    } else dropboxProblem = t.error;
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
  if (dropboxProblem) return fail(502, dropboxProblem.slice(0, 78), req);
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
