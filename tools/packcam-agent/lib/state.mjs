// What the agent remembers between restarts (data_dir/state.json):
//   cursor — scans are fetched from here on, by when the server got them (a
//            little behind the newest seen, so a scan that commits late is
//            not missed; duplicates are dropped by id).
//   jobs   — one per scan: its clip's progress, files and uploads.
//   files  — scan id → clip file on this PC, for Play over the office
//            network; an entry goes once its file has been removed by hand.
import fs from 'node:fs';
import path from 'node:path';
import { log, readJson, writeJson } from './util.mjs';

const KEEP_MS = 48 * 3600_000;          // finished jobs are forgotten after 2 days
const CURSOR_LAG_MS = 2 * 60_000;
const LATE_MS = 10_000;                 // a scan the server got this much after it was made came late
const MAX_RECUTS = 3;

/** Who scanned: one packer's next scan ends their own video, not a colleague's on the same camera. */
const packerOf = sc => sc.user_id || sc.session_id || null;
const samePacker = (a, b) => !a.packer || !b.packer || a.packer === b.packer;

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

  /**
   * A clip already cut that should be cut again: a scan sent late (the
   * packer's phone was offline) falls inside it, or the packer added time
   * after the video had stopped at the limit. Only while its recording is
   * still kept on this PC, and a few times at most.
   */
  function recut(j, why, keepMs, now) {
    if (!['uploading', 'done'].includes(j.status) || j.recut || (j.recuts || 0) >= MAX_RECUTS) return;
    if (!j.start || now - Date.parse(j.start) > keepMs - 3600_000) return;
    j.recut = why; touch();
    log(`clip ${j.awb}: will be cut again (${why})`);
  }

  /**
   * Add new scans from a poll. Returns how many were new. `nextCursor`: the
   * server's cursor for a full page (taken as it is). `keepMs`: how long the
   * recording is kept (a clip is only cut again while it is there).
   */
  function ingest(scans, nextCursor = null, keepMs = 0, now = Date.now()) {
    const before = st.cursor;
    let added = 0; let newest = st.cursor ? Date.parse(st.cursor) + CURSOR_LAG_MS : 0;
    for (const sc of scans) {
      // The cursor follows when the server got the scan: a scan sent late by
      // a phone that was offline keeps its real (earlier) scan time.
      newest = Math.max(newest, Date.parse(sc.received_at || sc.scanned_at));
      const extend = Math.max(0, Number(sc.extend_seconds) || 0);
      const old = st.jobs[sc.id];
      if (old) {
        // "+30 s" from the packer's countdown.
        if (extend !== (old.extend || 0)) {
          const longer = extend > (old.extend || 0);
          old.extend = extend; touch();
          if (longer && old.capped) recut(old, 'more time added', keepMs, now);
        }
        continue;
      }
      const job = { id: sc.id, awb: sc.awb, courier: sc.courier ?? null, camera: String(sc.camera), scanned_at: sc.scanned_at, packer: packerOf(sc), extend, status: 'queued', attempts: 0, next_try: 0, rev: 1, sent: 0 };
      st.jobs[sc.id] = job;
      added++;
      // Sent late: the packer's video before it may have been cut already,
      // running on over this parcel. Cut that one again to end here.
      if (sc.received_at && Date.parse(sc.received_at) - Date.parse(sc.scanned_at) > LATE_MS) {
        const t = Date.parse(sc.scanned_at);
        for (const j of Object.values(st.jobs)) {
          if (j.id === job.id || j.camera !== job.camera || !samePacker(j, job)) continue;
          if (Date.parse(j.scanned_at) < t && j.end && Date.parse(j.end) > t + 2000) recut(j, 'a scan sent late falls inside it', keepMs, now);
        }
      }
    }
    if (nextCursor) st.cursor = nextCursor;
    else if (newest) st.cursor = new Date(newest - CURSOR_LAG_MS).toISOString();
    // The newest scan comes back on every poll (the cursor lags behind it):
    // only a real change rewrites state.json.
    if (added || st.cursor !== before) touch();
    return added;
  }

  /**
   * The next scan after `job` on the same camera by the same packer (ms), or
   * null: two packers sharing a camera no longer cut each other's videos short.
   */
  function nextScanMs(job) {
    const at = Date.parse(job.scanned_at);
    let best = null;
    for (const j of Object.values(st.jobs)) {
      if (j.camera !== job.camera || j.id === job.id || !samePacker(j, job)) continue;
      const t = Date.parse(j.scanned_at);
      if (t > at && (best == null || t < best)) best = t;
    }
    return best;
  }

  /** Jobs still to cut or upload, oldest first. */
  const pending = () => Object.values(st.jobs).filter(j => j.status === 'queued' || j.status === 'uploading' || j.recut).sort((a, b) => Date.parse(a.scanned_at) - Date.parse(b.scanned_at));

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
      const done = !['queued', 'uploading'].includes(j.status) && !j.recut && !isDirty(j);
      if (done && now - Date.parse(j.scanned_at) > KEEP_MS) { delete st.jobs[id]; touch(); }
    }
  }

  /**
   * PC clips someone has moved or deleted from the clips folder (scan ids).
   * A clip whose folder itself is gone (drive unplugged, share offline) is
   * not counted: it may come back.
   */
  function removedFiles() {
    const out = [];
    for (const [id, f] of Object.entries(st.files)) {
      if (!fs.existsSync(f) && fs.existsSync(path.dirname(path.dirname(f)))) out.push(id);
    }
    return out;
  }
  /** The server knows these clips are gone from the PC: stop listing them. */
  function forgetFiles(ids) {
    for (const id of ids) {
      delete st.files[id];
      const j = st.jobs[id];
      if (j && j.pc_path) { j.pc_path = null; if (!j.dropbox_path && !j.gdrive_file_id && j.status === 'done') j.status = 'removed'; mark(j); }
    }
    if (ids.length) touch();
  }

  /** Write state.json if it changed. A failed write is logged and retried next round. */
  function save() {
    if (!changed) return;
    try { writeJson(file, st); changed = false; } catch (e) { log(`state save: ${e.message}`); }
  }

  return { st, touch, mark, ingest, nextScanMs, pending, unreported, reported, tidy, removedFiles, forgetFiles, save };
}
