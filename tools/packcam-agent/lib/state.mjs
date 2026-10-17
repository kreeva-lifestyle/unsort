// What the agent remembers between restarts (data_dir/state.json):
//   cursor — scans are fetched from here on (a little behind the newest seen,
//            so a scan that commits late is not missed; duplicates are
//            dropped by id).
//   jobs   — one per scan: its clip's progress, files and uploads.
//   files  — scan id → clip file on this PC, for Play over the office
//            network; an entry goes once its file has been removed by hand.
import fs from 'node:fs';
import path from 'node:path';
import { log, readJson, writeJson } from './util.mjs';

const KEEP_MS = 48 * 3600_000;          // finished jobs are forgotten after 2 days
const CURSOR_LAG_MS = 2 * 60_000;

export function makeState(dataDir) {
  const file = path.join(dataDir, 'state.json');
  const st = readJson(file, null) || {};
  st.cursor ??= null; st.jobs ??= {}; st.files ??= {};
  let changed = false;
  const touch = () => { changed = true; };
  // A job is reported when its revision moves past the last one the server
  // accepted — a change made while a report is in flight is sent next time.
  const isDirty = j => (j.rev || 0) !== (j.sent || 0);
  /** Record a change to a job (reported on the next round). */
  const mark = j => { j.rev = (j.rev || 0) + 1; touch(); };

  /** Add new scans from a poll. Returns how many were new. */
  function ingest(scans) {
    const before = st.cursor;
    let added = 0; let newest = st.cursor ? Date.parse(st.cursor) + CURSOR_LAG_MS : 0;
    for (const sc of scans) {
      newest = Math.max(newest, Date.parse(sc.scanned_at));
      if (st.jobs[sc.id]) continue;
      st.jobs[sc.id] = { id: sc.id, awb: sc.awb, courier: sc.courier ?? null, camera: String(sc.camera), scanned_at: sc.scanned_at, status: 'queued', attempts: 0, next_try: 0, rev: 1, sent: 0 };
      added++;
    }
    if (newest) st.cursor = new Date(newest - CURSOR_LAG_MS).toISOString();
    // The newest scan comes back on every poll (the cursor lags behind it):
    // only a real change rewrites state.json.
    if (added || st.cursor !== before) touch();
    return added;
  }

  /** The next scan after `job` on the same camera (ms), or null. */
  function nextScanMs(job) {
    const at = Date.parse(job.scanned_at);
    let best = null;
    for (const j of Object.values(st.jobs)) {
      if (j.camera !== job.camera || j.id === job.id) continue;
      const t = Date.parse(j.scanned_at);
      if (t > at && (best == null || t < best)) best = t;
    }
    return best;
  }

  /** Jobs still to cut or upload, oldest first. */
  const pending = () => Object.values(st.jobs).filter(j => j.status === 'queued' || j.status === 'uploading').sort((a, b) => Date.parse(a.scanned_at) - Date.parse(b.scanned_at));

  /** Clip rows for the server, for jobs that changed since the last report. */
  function unreported() {
    return Object.values(st.jobs).filter(j => isDirty(j)).slice(0, 200).map(j => ({
      _rev: j.rev, scan_id: j.id, awb: j.awb, courier: j.courier, camera: j.camera, scanned_at: j.scanned_at,
      status: j.status,
      clip_start: j.start ?? null, clip_end: j.end ?? null, duration_s: j.duration ?? null, size_bytes: j.size ?? null,
      pc_path: j.pc_path ?? null, dropbox_path: j.dropbox_path ?? null, gdrive_file_id: j.gdrive_file_id ?? null, gdrive_link: j.gdrive_link ?? null,
      error: j.error ?? null,
    }));
  }
  function reported(rows) {
    for (const r of rows) if (st.jobs[r.scan_id]) st.jobs[r.scan_id].sent = r._rev;
    if (rows.length) touch();
  }

  /** Forget finished jobs older than two days (their files stay listed in `files`). */
  function tidy(now) {
    for (const [id, j] of Object.entries(st.jobs)) {
      const done = !['queued', 'uploading'].includes(j.status) && !isDirty(j);
      if (done && now - Date.parse(j.scanned_at) > KEEP_MS) { delete st.jobs[id]; touch(); }
    }
  }

  /** Drop PC clips that someone has removed from the clips folder. */
  function forgetRemoved() {
    for (const [id, f] of Object.entries(st.files)) if (!fs.existsSync(f)) { delete st.files[id]; touch(); }
  }

  /** Write state.json if it changed. A failed write is logged and retried next round. */
  function save() {
    if (!changed) return;
    try { writeJson(file, st); changed = false; } catch (e) { log(`state save: ${e.message}`); }
  }

  return { st, touch, mark, ingest, nextScanMs, pending, unreported, reported, tidy, forgetRemoved, save };
}
