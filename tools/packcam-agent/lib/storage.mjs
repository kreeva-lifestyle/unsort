// How much room is left where clips are saved — the PC folder, Dropbox,
// Google Drive — and roughly how many days that lasts at the current rate.
// Dropbox and Drive are asked every 30 minutes, and at once when one is
// switched on (their own APIs, nothing on our server); the PC disks on every
// heartbeat. The result rides along in the heartbeat, so the app shows it
// without any extra request.
//   level: ok · low (under 7 days or 5 GB) · full (under 1 day or 1 GB)
import fs from 'node:fs';
import { diskInfo, log } from './util.mjs';
import { dropboxSpace } from './dropbox.mjs';

const CLOUD_EVERY = 30 * 60_000;
const CLOUD_RETRY = 5 * 60_000;     // after Dropbox / Drive did not answer
const GB = 1e9;

export function levelOf(freeBytes, perDay) {
  if (freeBytes == null) return 'ok';
  const days = perDay > 0 ? freeBytes / perDay : Infinity;
  if (freeBytes < 1 * GB || days < 1) return 'full';
  if (freeBytes < 5 * GB || days < 7) return 'low';
  return 'ok';
}

const place = (free, total, perDay, extra = {}) => ({
  free_gb: free == null ? null : +(free / GB).toFixed(1),
  total_gb: total == null ? null : +(total / GB).toFixed(1),
  days: free == null || !(perDay > 0) ? null : Math.floor(free / perDay),
  level: levelOf(free, perDay),
  ...extra,
});

export function makeStorage(drive) {
  const cloud = { dropbox: null, gdrive: null, at: 0, busy: false, want: '' };
  // Which clouds to ask: a change (one switched on, Drive connected) asks at once.
  const wanted = (settings, dropboxToken) => {
    const t = settings?.targets || {};
    return `${!!(t.dropbox && dropboxToken?.access_token)}/${!!(t.gdrive && drive.status().connected)}`;
  };

  /** Bytes of clips saved per day, from the clips cut in the last 24 h (jobs are kept 48 h). */
  function perDay(jobs, now) {
    let bytes = 0;
    for (const j of jobs) if (j.size && j.start && now - Date.parse(j.start) < 86_400_000) bytes += Number(j.size) || 0;
    return bytes;
  }

  async function refreshCloud(settings, dropboxToken) {
    if (cloud.busy) return;
    cloud.busy = true; cloud.want = wanted(settings, dropboxToken);
    try {
      const t = settings?.targets || {};
      if (t.dropbox && dropboxToken?.access_token) {
        try { cloud.dropbox = { ...(await dropboxSpace(dropboxToken.access_token)) }; }
        catch (e) { cloud.dropbox = { error: e.message }; log(`dropbox space: ${e.message}`); }
      } else cloud.dropbox = null;
      if (t.gdrive && drive.status().connected) {
        try { cloud.gdrive = { ...(await drive.space()) }; }
        catch (e) { cloud.gdrive = { error: e.message }; log(`drive space: ${e.message}`); }
      } else cloud.gdrive = null;
      cloud.at = Date.now();
    } finally { cloud.busy = false; }
  }

  /** The storage part of the heartbeat. `pcFolder` = where PC clips really go. */
  function status({ settings, dropboxToken, jobs, pcFolder, dataDir, now = Date.now() }) {
    const failed = cloud.dropbox?.error || cloud.gdrive?.error;
    if (settings && (now - cloud.at > (failed ? CLOUD_RETRY : CLOUD_EVERY) || wanted(settings, dropboxToken) !== cloud.want)) refreshCloud(settings, dropboxToken);
    const rate = perDay(jobs, now);
    const t = settings?.targets || {};
    const out = {};
    // The raw recording buffer lives in the data folder: its disk always
    // counts, but it only fills up with videos when PC copies are kept on that
    // same disk (the buffer itself is pruned by hours).
    const pcKept = t.pc || (!t.pc && !t.dropbox && !t.gdrive);
    let sameDisk = false;
    try { sameDisk = fs.statSync(dataDir).dev === fs.statSync(pcFolder).dev; } catch { /* folder not there yet */ }
    const rec = diskInfo(dataDir);
    out.recording = place(rec.free_gb == null ? null : rec.free_gb * GB, rec.total_gb == null ? null : rec.total_gb * GB, pcKept && sameDisk ? rate : 0);
    if (t.pc) {
      const d = diskInfo(pcFolder);
      out.pc = place(d.free_gb == null ? null : d.free_gb * GB, d.total_gb == null ? null : d.total_gb * GB, rate);
    }
    for (const k of ['dropbox', 'gdrive']) {
      if (!t[k]) continue;
      const c = cloud[k];
      out[k] = !c ? { level: 'ok', checking: true } : c.error ? { level: 'ok', error: c.error } : place(c.free, c.total, rate);
    }
    out.per_day_gb = +(rate / GB).toFixed(2);
    return out;
  }

  return { status, refreshCloud };
}
