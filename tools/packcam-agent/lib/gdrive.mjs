// Google Drive: the PC signs in once (Pack Cam page on the PC → Connect
// Google Drive) with the narrow drive.file scope — the agent can only see
// the files it created itself. The refresh token stays on this PC
// (data_dir/gdrive.json). Clips go to <folder>/<YYYY-MM-DD>/<name>.mp4.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './util.mjs';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = process.env.PACKCAM_GOOGLE_TOKEN || 'https://oauth2.googleapis.com/token';
const API = process.env.PACKCAM_GDRIVE_API || 'https://www.googleapis.com/drive/v3';
const UPLOAD = process.env.PACKCAM_GDRIVE_UPLOAD || 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const CHUNK = 32 * 1024 * 1024;   // a multiple of 256 KB, as Drive requires

export function makeDrive(cfg) {
  const file = path.join(cfg.data_dir, 'gdrive.json');
  const redirect = `http://localhost:${cfg.port}/gdrive/callback`;
  let access = null; let accessUntil = 0;
  const folders = new Map();   // "parent/name" → id, for this run

  const saved = () => readJson(file, null);
  const configured = () => !!(cfg.gdrive_client_id && cfg.gdrive_client_secret);

  function authUrl(state) {
    return `${AUTH}?${new URLSearchParams({ client_id: cfg.gdrive_client_id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state })}`;
  }

  async function tokenCall(params) {
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.gdrive_client_id, client_secret: cfg.gdrive_client_secret, ...params }), signal: AbortSignal.timeout(30_000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google sign-in ${r.status}: ${d.error_description || d.error || 'failed'}`);
    return d;
  }

  async function finishConnect(code) {
    const d = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: redirect });
    if (!d.refresh_token) throw new Error('Google did not return a refresh token — remove Pack Cam from your Google account access and connect again');
    writeJson(file, { refresh_token: d.refresh_token, connected_at: new Date().toISOString() });
    access = d.access_token; accessUntil = Date.now() + (d.expires_in - 120) * 1000;
    folders.clear();
  }

  async function token() {
    if (access && Date.now() < accessUntil) return access;
    const s = saved();
    if (!s?.refresh_token) throw new Error('Google Drive is not connected on the PC — open the Pack Cam page on the PC and connect it');
    const d = await tokenCall({ grant_type: 'refresh_token', refresh_token: s.refresh_token });
    access = d.access_token; accessUntil = Date.now() + (d.expires_in - 120) * 1000;
    return access;
  }

  async function api(url, init = {}) {
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(5 * 60_000), duplex: 'half' });
    return r;
  }

  async function folder(name, parent) {
    const key = `${parent}/${name}`;
    if (folders.has(key)) return folders.get(key);
    const q = `name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType='${FOLDER}' and '${parent}' in parents and trashed=false`;
    const r = await api(`${API}/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' })}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Drive ${r.status}: ${d.error?.message || 'folder lookup failed'}`);
    let id = d.files?.[0]?.id;
    if (!id) {
      const c = await api(`${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) });
      const cd = await c.json().catch(() => ({}));
      if (!c.ok) throw new Error(`Google Drive ${c.status}: ${cd.error?.message || 'could not create folder'}`);
      id = cd.id;
    }
    folders.set(key, id);
    return id;
  }

  const esc = v => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const linkOf = d => ({ id: d.id, link: d.webViewLink || `https://drive.google.com/file/d/${d.id}/view` });

  /**
   * Upload a clip; returns { id, link }. A file of the same name and size
   * already in the day folder (an earlier try whose answer was lost) is
   * reused, not uploaded twice. The body goes in 32 MB pieces, each with its
   * own timeout, so a big clip on a slow line still gets through.
   */
  async function upload(localFile, folderName, dateName) {
    // The folder may be a path ("Packing/Videos"); each part is found or made.
    let base = 'root';
    for (const part of String(folderName || 'PackCam').split('/').map(x => x.trim()).filter(Boolean)) base = await folder(part, base);
    const parent = await folder(dateName, base);
    const size = fs.statSync(localFile).size;
    const name = path.basename(localFile);
    const q = `name='${esc(name)}' and '${parent}' in parents and trashed=false`;
    const found = await api(`${API}/files?${new URLSearchParams({ q, fields: 'files(id,webViewLink,size)', pageSize: '5' })}`);
    const fd0 = await found.json().catch(() => ({}));
    const same = found.ok && (fd0.files || []).find(f => Number(f.size) === size);
    if (same) return linkOf(same);

    const init = await api(`${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) },
      body: JSON.stringify({ name, parents: [parent] }),
    });
    const where = init.headers.get('location');
    if (!init.ok || !where) throw new Error(`Google Drive upload ${init.status}: could not start`);
    const fd = fs.openSync(localFile, 'r');
    try {
      const buf = Buffer.alloc(CHUNK);
      let off = 0;
      for (;;) {
        const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, size - off), off);
        const r = await api(where, { method: 'PUT', headers: { 'content-range': `bytes ${off}-${off + n - 1}/${size}` }, body: buf.subarray(0, n) });
        if (r.status === 308) {
          // Continue from what Google says it has ("bytes=0-1234").
          const got = /bytes=0-(\d+)/.exec(r.headers.get('range') || '');
          off = got ? Number(got[1]) + 1 : off;
          if (off >= size) throw new Error('Google Drive upload: the upload did not finish');
          continue;
        }
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.id) {
          const e = new Error(`Google Drive upload ${r.status}: ${d.error?.message || 'failed'}`);
          // Drive full: a retry cannot fix it, the clip is marked failed.
          e.permanent = r.status === 403 && /storageQuotaExceeded|quota/i.test(JSON.stringify(d.error || ''));
          throw e;
        }
        return linkOf(d);
      }
    } finally { fs.closeSync(fd); }
  }

  function status() {
    const s = saved();
    return { configured: configured(), connected: !!s?.refresh_token, connected_at: s?.connected_at || null };
  }

  /** The account's storage: { free, total } in bytes (total null = no limit). */
  async function space() {
    const r = await api(`${API}/about?fields=storageQuota`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Drive ${r.status}: ${d.error?.message || 'could not read the storage'}`);
    const q = d.storageQuota || {};
    const total = q.limit != null ? Number(q.limit) : null;
    return { free: total == null ? null : Math.max(0, total - Number(q.usage || 0)), total };
  }

  /** Remove a file Pack Cam itself uploaded (a clip being cut again). */
  async function remove(id) {
    const r = await api(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw new Error(`Google Drive ${r.status}: could not remove the old video`);
  }

  return { configured, authUrl, finishConnect, upload, status, space, remove };
}
