#!/usr/bin/env node
// Pack Cam agent — runs on the office PC next to the cameras.
//   node packcam.mjs [path/to/config.json]
// Two loops share the state:
//   * every few seconds: check in with DailyOffice (settings, cameras, new
//     scans), keep one recorder per camera running, report clips.
//   * the worker: cut and upload, one step at a time.
// Pack Cam never deletes a clip: the team clears old ones from the clips
// folder, Dropbox or Drive themselves.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, diskInfo, initLog, lanAddress, loadConfig, log, sleep } from './lib/util.mjs';
import { makeApi } from './lib/api.mjs';
import { makeState } from './lib/state.mjs';
import { makeDrive } from './lib/gdrive.mjs';
import { Recorder, stopOrphanRecorders } from './lib/recorder.mjs';
import { dirBytes, prune } from './lib/segments.mjs';
import { step } from './lib/worker.mjs';
import { startServer } from './lib/server.mjs';
import { ensureKey, readKey } from './lib/key.mjs';
import { makeStorage } from './lib/storage.mjs';
import { testCamera } from './lib/cameratest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(process.argv[2] || path.join(here, 'config.json'));
initLog(cfg.data_dir);
const api = makeApi(cfg);
const state = makeState(cfg.data_dir);
const drive = makeDrive(cfg);
const lanUrl = cfg.lan_url || `http://${lanAddress()}:${cfg.port}`;
const storage = makeStorage(drive);

let settings = null; let dropbox = null; let playSecret = null; let offset = 0;
let serverOk = false; let lastError = ''; let bufferBytes = 0; let wasRecording = false; let folderWarning = '';
const recorders = new Map();          // camera number → Recorder
// "Test connection" answers, camera number → { nonce, ok, message }.
const tests = {}; let testNonce = null;

// The last upload to each place: null = it worked; an Error = it failed.
const uploads = { dropbox: undefined, gdrive: undefined };
const uploadResult = (place, err) => { uploads[place] = err ? { error: String(err.message || err).slice(0, 200), at: Date.now() } : null; };
const ctx = { cfg, state, drive, settings: () => settings, dropbox: () => dropbox, offset: () => offset, setFolderWarning: w => { folderWarning = w; }, uploadResult };

function syncRecorders(cameras) {
  const want = new Map(cameras.map(c => [c.number, c]));
  for (const [n, r] of recorders) {
    if (!want.has(n) || r.key !== JSON.stringify(want.get(n))) { r.stop(); recorders.delete(n); }
  }
  for (const [n, c] of want) if (!recorders.has(n)) recorders.set(n, new Recorder(cfg, c));
}

function status() {
  const jobs = Object.values(state.st.jobs);
  const pcFolder = (!folderWarning && (settings?.pc_folder || '').trim()) || path.join(cfg.data_dir, 'clips');
  return {
    version: VERSION, host: os.hostname(), os: `${os.platform()} ${os.release()}`, lan_url: lanUrl,
    enabled: !!settings?.enabled, disk: diskInfo(cfg.data_dir), buffer_gb: +(bufferBytes / 1e9).toFixed(1),
    cameras: [...recorders.values()].map(r => r.status()),
    queue: { waiting: jobs.filter(j => j.status === 'queued' || j.status === 'uploading').length, failed: jobs.filter(j => j.status === 'failed').length },
    // "Ready" only while the last upload there worked (or none was tried yet).
    dropbox: settings?.targets?.dropbox ? (dropbox?.error ? { ok: false, error: dropbox.error }
      : uploads.dropbox ? { ok: false, error: `Uploads failing: ${uploads.dropbox.error}` } : { ok: !!dropbox?.access_token }) : null,
    gdrive: settings?.targets?.gdrive ? { ...drive.status(), upload_error: uploads.gdrive ? `Uploads failing: ${uploads.gdrive.error}` : null } : null,
    // Where clips really go: the fallback while the chosen folder cannot be used.
    pc_folder: pcFolder,
    storage: storage.status({ settings, dropboxToken: dropbox, jobs, pcFolder, dataDir: cfg.data_dir }),
    tests,
    last_error: [lastError, folderWarning].filter(Boolean).join(' · ') || null,
  };
}

/**
 * Settings → Pack Cam → Cameras → "Test connection" sets a new test_nonce:
 * ask every camera once; one stopped for a wrong password records again once
 * it answers (e.g. the password was changed on the camera to match).
 * After a start, a press more than 2 minutes old is only noted.
 */
async function runTests(nonce, cameras, serverNow) {
  if (!nonce || nonce === testNonce) return;
  const first = testNonce === null; testNonce = nonce;
  // The nonce is the press time (ms): one pressed while the PC was starting still counts.
  if (first && !(Math.abs(Date.parse(serverNow) - Number(nonce)) < 120_000)) return;
  log('testing the camera connections');
  // All at once: an unreachable camera takes ~10 s, and the app is waiting.
  await Promise.all(cameras.map(async c => {
    const r = await testCamera(cfg, c);
    if (nonce !== testNonce) return;   // a newer press is running
    tests[c.number] = { nonce, ok: r.ok, message: r.message, at: new Date().toISOString() };
    log(`camera ${c.number} test: ${r.message}`);
    // Only a camera that answered goes back to recording: one stopped for a
    // wrong password stays stopped (each failed login brings the camera's
    // lock-out nearer); a new password in the app starts it afresh anyway.
    if (r.ok) recorders.get(c.number)?.retry();
  }));
}

async function checkIn() {
  // key.txt is read on every poll: a key pasted again (a new one made in the
  // app) is used without restarting Pack Cam.
  cfg.agent_key = readKey(cfg.key_file) || cfg.agent_key;
  const t0 = Date.now();
  const d = await api.poll(state.st.cursor, status());
  // How far this PC's clock is from the server's (scan times are the server's).
  const skew = Date.parse(d.now) - (t0 + Date.now()) / 2;
  offset = Math.abs(skew) > 1500 ? Math.round(skew) : 0;
  settings = d.settings; dropbox = d.dropbox; playSecret = d.play_secret;
  const recording = settings.enabled && (d.cameras || []).length > 0;
  syncRecorders(recording ? d.cameras : []);
  runTests(settings.test_nonce || null, d.cameras || [], d.now).catch(e => log(`camera test: ${e.message}`));
  if (!recording) {
    // Scans made just before recording was switched off still have footage:
    // take them on this first poll, then keep the cursor at "now" so turning
    // recording back on does not list the unrecorded scans as missing clips.
    if (wasRecording) state.ingest(d.scans || [], d.next_cursor, keepMs());
    wasRecording = false;
    if (state.st.cursor !== d.now) { state.st.cursor = d.now; state.touch(); }
    return;
  }
  wasRecording = true;
  const added = state.ingest(d.scans || [], d.next_cursor, keepMs());
  if (added) log(`${added} new scan(s)`);
}

async function report() {
  const rows = state.unreported();
  if (!rows.length) return;
  await api.report(rows.map(({ _rev, ...r }) => r));
  state.reported(rows);
}

/** How long the raw recording is kept (a cut clip can only be cut again within it). */
const keepMs = () => Math.max(1, Number(settings?.buffer_hours) || 6) * 3600_000;

/**
 * Videos moved or deleted from the PC folder by hand: tell the server, so
 * they stop showing "Saved" (a Dropbox / Drive copy still plays).
 */
let lastRemovedCheck = 0;
async function reportRemoved(now) {
  if (now - lastRemovedCheck < (Number(process.env.PACKCAM_REMOVED_CHECK_MS) || 10 * 60_000)) return;   // env: tests only
  lastRemovedCheck = now;
  const ids = state.removedFiles();
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    await api.removed(part);
    state.forgetFiles(part);
    log(`${part.length} video(s) moved or deleted from the PC folder`);
  }
}

function housekeeping(now) {
  // Keep `buffer_hours` of recording, but never a piece a waiting clip still
  // needs — unless the disk is nearly full.
  const s = settings || {};
  const low = (diskInfo(cfg.data_dir).free_gb ?? 99) < 3;
  let before = now - (low ? 1 : Math.max(1, Number(s.buffer_hours) || 6)) * 3600_000;
  // A nearly full disk wins: recording must not stop for a clip still waiting.
  if (!low) for (const j of state.pending()) if (j.status === 'queued') before = Math.min(before, Date.parse(j.scanned_at) - offset - (Number(s.pre_roll_seconds) || 0) * 1000 - 120_000);
  let total = 0;
  const segRoot = path.join(cfg.data_dir, 'segments');
  for (const d of fs.readdirSync(segRoot)) {
    const dir = path.join(segRoot, d);
    if (prune(dir, before) && low) lastError = 'Disk almost full — keeping only 1 hour of recording';
    total += dirBytes(dir);
  }
  bufferBytes = total;
  state.tidy(now);

}

async function checkInLoop() {
  let lastHouse = 0;
  for (;;) {
    try {
      await checkIn();
      await report();
      await reportRemoved(Date.now());
      serverOk = true;
      if (!/^Disk/.test(lastError)) lastError = '';
    } catch (e) {
      serverOk = false; lastError = e.message;
      log(`server: ${e.message}`);
    }
    if (Date.now() - lastHouse > 60_000) {
      lastHouse = Date.now();
      try { housekeeping(lastHouse); } catch (e) { log(`housekeeping: ${e.message}`); }
    }
    state.save();
    await sleep(cfg.poll_ms);
  }
}

async function workLoop() {
  for (;;) {
    let busy = false;
    try {
      // Cutting comes first: a pile of upload retries must never hold up new
      // scans (their footage is only kept for the recording buffer).
      const jobs = state.pending();
      for (const job of [...jobs.filter(j => j.status === 'queued'), ...jobs.filter(j => j.status !== 'queued')]) {
        if (await step(ctx, job, Date.now())) { busy = true; break; }
      }
    } catch (e) { log(`worker: ${e.message}`); }
    state.save();
    if (!busy) await sleep(2000);
  }
}

function shutdown() {
  log('stopping');
  for (const r of recorders.values()) r.stop();
  state.save();
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('unhandledRejection', e => log(`unexpected: ${e?.message || e}`));
process.on('SIGTERM', shutdown);

log(`Pack Cam agent ${VERSION} · data ${cfg.data_dir} · ${lanUrl}`);
const web = startServer(cfg, {
  secret: () => playSecret,
  clipFile: id => state.st.files[id] || null,
  status: () => ({ ...status(), server_ok: serverOk }),
  drive,
});
// One Pack Cam per PC: a second copy (start.bat opened while it already runs
// at sign-in) would record every camera twice into the same folders and cut
// the same clips. Its port is taken, so it stops before recording anything;
// exit code 3 tells start.bat not to restart it.
await new Promise(resolve => {
  web.once('listening', resolve);
  web.once('error', e => {
    if (e.code !== 'EADDRINUSE') return resolve();
    log(`Pack Cam is already running on this PC (port ${cfg.port} is in use) — this copy is stopping.`);
    process.exit(3);
  });
});
await stopOrphanRecorders(cfg);
await ensureKey(cfg);
checkInLoop();
workLoop();
