// Dropbox Uploader transport. XMLHttpRequest throughout, not fetch: only XHR
// reports UPLOAD progress events, and progress is the whole point here.
//
// Two paths, chosen by what actually happens rather than by assumption:
//   1. DIRECT  — the edge function mints a short-lived Dropbox upload link and
//                the browser sends the bytes straight to Dropbox. Real
//                progress, 150 MB ceiling, and the Dropbox refresh token never
//                reaches the browser.
//   2. RELAY   — only if the browser cannot reach Dropbox at all (locked-down
//                network, or Dropbox refusing the cross-origin upload). The
//                bytes then travel through our own edge function, which is
//                already proven reachable. Small files only: request bodies of
//                15 MB+ are refused upstream (measured), so anything bigger
//                must not take this path and says so instead of failing oddly.
import { call } from '../dropboxlinks/api';
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';

export const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';
/** Dropbox's ceiling for a temporary-upload-link transfer. */
export const MAX_FILE = 150 * 1024 * 1024;
/** Safe relay payload: 5 MB of file is ~6.7 MB of base64 JSON. */
export const RELAY_MAX = 5 * 1024 * 1024;

export interface UpFolder { label: string; path: string }
export type UpState = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';
export interface UpItem { id: string; file: File; state: UpState; pct: number; message?: string; path?: string }

export const humanBytes = (n: number): string =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

/** `unreachable` distinguishes "this browser can't talk to Dropbox" (worth a
 *  relay retry) from "Dropbox said no" (retrying changes nothing). */
class UploadError extends Error {
  constructor(message: string, readonly unreachable = false) { super(message); }
}

/** Server messages here are written for people — show them, don't flatten. */
const serverMsg = (data: Record<string, unknown> | undefined, status: number): string => {
  const e = String(data?.error || '');
  if (e === 'dropbox_not_connected') return 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check.';
  if (e === 'no_folders') return 'No upload folders configured — an admin can add them in the Link Generator settings.';
  if (e === 'needs_write_scope') return 'Dropbox needs the file-upload permission — an admin must reconnect Dropbox.';
  return String(data?.details || e || '').trim() || `Upload failed (${status})`;
};

/** Local, deliberately not shared: 5 lines beats coupling this module to
 *  another feature's file. FileReader (not arrayBuffer+btoa) — spreading a
 *  photo-sized byte array overflows the call stack. */
const fileToB64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new UploadError('Could not read that file from this device'));
    fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^;]+;base64,/, ''));
    fr.readAsDataURL(file);
  });

function xhrSend(
  url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>,
  onProgress: (pct: number) => void, hold: { xhr?: XMLHttpRequest },
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    hold.xhr = xhr;
    xhr.open('POST', url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || '' });
    // status 0 with no response is the signature of a blocked/cross-origin
    // failure — the one case where the relay is worth trying.
    xhr.onerror = () => reject(new UploadError('Could not reach Dropbox from this device', true));
    xhr.ontimeout = () => reject(new UploadError('The upload timed out — check the connection and try again'));
    xhr.onabort = () => reject(new UploadError('Cancelled'));
    xhr.send(body);
  });
}

/** Upload ONE file. Resolves with the Dropbox path it landed on. */
export async function uploadFile(
  file: File, folderPath: string, subPath: string,
  onProgress: (pct: number) => void, hold: { xhr?: XMLHttpRequest },
): Promise<string> {
  if (file.size > MAX_FILE) throw new UploadError(`Too big for one upload (${humanBytes(file.size)}) — Dropbox accepts up to 150 MB this way.`);
  if (file.size === 0) throw new UploadError('That file is empty.');

  const { status, data } = await call({ action: 'up_link', folderPath, subPath, name: file.name, size: file.size });
  if (!data?.ok) throw new UploadError(serverMsg(data as Record<string, unknown>, status));
  const link = String((data as Record<string, unknown>).link || '');
  const path = String((data as Record<string, unknown>).path || file.name);

  try {
    const r = await xhrSend(link, file, { 'Content-Type': 'application/octet-stream' }, onProgress, hold);
    if (r.status < 200 || r.status >= 300) {
      // Dropbox answered, so it is not a reachability problem: relaying the
      // same bytes would fail identically. Report what Dropbox said.
      throw new UploadError(`Dropbox rejected the file (${r.status}) ${r.text.slice(0, 160)}`.trim());
    }
    return path;
  } catch (e) {
    if (!(e instanceof UploadError) || !e.unreachable) throw e;
    // Direct route blocked — fall back through our own server, which every
    // other feature in this app already reaches successfully.
    if (file.size > RELAY_MAX) {
      throw new UploadError(`This device cannot upload to Dropbox directly, and ${humanBytes(file.size)} is too large to send the slower way (limit ${humanBytes(RELAY_MAX)}). Try another network, or upload it from the Dropbox app.`);
    }
    onProgress(0);
    const b64 = await fileToB64(file);
    // XHR again rather than the shared fetch helper: the relay is the SLOW
    // path (base64, one extra hop), so it needs progress most of all.
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token || SUPABASE_ANON_KEY;
    const r2 = await xhrSend(
      FN, JSON.stringify({ action: 'up_relay', folderPath, subPath, name: file.name, b64 }),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
      onProgress, hold,
    );
    let d2: Record<string, unknown> = {};
    try { d2 = JSON.parse(r2.text || '{}'); } catch { /* non-JSON body handled below */ }
    if (!d2?.ok) throw new UploadError(serverMsg(d2, r2.status));
    return String(d2.path || path);
  }
}

export const errText = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : 'Upload failed';
