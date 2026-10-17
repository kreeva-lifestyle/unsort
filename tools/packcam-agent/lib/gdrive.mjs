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
    const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${await token()}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(10 * 60_000), duplex: 'half' });
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

  /** Upload a clip; returns { id, link }. Resumable upload, one request for the body. */
  async function upload(localFile, folderName, dateName) {
    const parent = await folder(dateName, await folder(folderName || 'PackCam', 'root'));
    const size = fs.statSync(localFile).size;
    const init = await api(`${UPLOAD}/files?uploadType=resumable&fields=id,webViewLink`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) },
      body: JSON.stringify({ name: path.basename(localFile), parents: [parent] }),
    });
    const where = init.headers.get('location');
    if (!init.ok || !where) throw new Error(`Google Drive upload ${init.status}: could not start`);
    // A Blob backed by the file: sent with its length, never held in memory.
    const r = await api(where, { method: 'PUT', headers: { 'content-type': 'video/mp4' }, body: await fs.openAsBlob(localFile) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) throw new Error(`Google Drive upload ${r.status}: ${d.error?.message || 'failed'}`);
    return { id: d.id, link: d.webViewLink || `https://drive.google.com/file/d/${d.id}/view` };
  }

  /** Delete a Drive file; a file that is already gone counts as deleted. */
  async function remove(id) {
    const r = await api(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) return;
    const d = await r.json().catch(() => ({}));
    throw new Error(`Google Drive delete ${r.status}: ${d.error?.message || 'failed'}`);
  }

  function status() {
    const s = saved();
    return { configured: configured(), connected: !!s?.refresh_token, connected_at: s?.connected_at || null };
  }

  return { configured, authUrl, finishConnect, upload, remove, status };
}
