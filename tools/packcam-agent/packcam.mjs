#!/usr/bin/env node
// Pack Cam agent — runs on the office PC next to the cameras.
//   node packcam.mjs [path/to/config.json]
// Two loops share the state:
//   * every few seconds: check in with DailyOffice (settings, cameras, new
//     scans, deletes), keep one recorder per camera running, report clips.
//   * the worker: cut, upload and delete, one step at a time.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, diskInfo, initLog, lanAddress, loadConfig, log, sleep } from './lib/util.mjs';
import { makeApi } from './lib/api.mjs';
import { makeState } from './lib/state.mjs';
import { makeDrive } from './lib/gdrive.mjs';
import { Recorder } from './lib/recorder.mjs';
import { dirBytes, prune } from './lib/segments.mjs';
import { removeClip, step } from './lib/worker.mjs';
import { startServer } from './lib/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(process.argv[2] || path.join(here, 'config.json'));
initLog(cfg.data_dir);
const api = makeApi(cfg);
const state = makeState(cfg.data_dir);
const drive = makeDrive(cfg);
const lanUrl = cfg.lan_url || `http://${lanAddress()}:${cfg.port}`;

let settings = null; let dropbox = null; let playSecret = null; let offset = 0;
let serverOk = false; let lastError = ''; let deletes = []; let bufferBytes = 0;
const recorders = new Map();          // camera number → Recorder
const deleted = []; const deleteFailed = [];
const deleteHandled = new Map();      // clip id → time handled (skip until the server catches up)

const ctx = { cfg, state, drive, settings: () => settings, dropbox: () => dropbox, offset: () => offset };

function syncRecorders(cameras) {
  const want = new Map(cameras.map(c => [c.number, c]));
  for (const [n, r] of recorders) {
    if (!want.has(n) || r.key !== JSON.stringify(want.get(n))) { r.stop(); recorders.delete(n); }
  }
  for (const [n, c] of want) if (!recorders.has(n)) recorders.set(n, new Recorder(cfg, c));
}

function status() {
  const jobs = Object.values(state.st.jobs);
  return {
    version: VERSION, host: os.hostname(), os: `${os.platform()} ${os.release()}`, lan_url: lanUrl,
    enabled: !!settings?.enabled, disk: diskInfo(cfg.data_dir), buffer_gb: +(bufferBytes / 1e9).toFixed(1),
    cameras: [...recorders.values()].map(r => r.status()),
    queue: { waiting: jobs.filter(j => j.status === 'queued' || j.status === 'uploading').length, failed: jobs.filter(j => j.status === 'failed').length },
    dropbox: settings?.targets?.dropbox ? (dropbox?.error ? { ok: false, error: dropbox.error } : { ok: !!dropbox?.access_token }) : null,
    gdrive: settings?.targets?.gdrive ? drive.status() : null,
    last_error: lastError || null,
  };
}

async function checkIn() {
  const t0 = Date.now();
  const d = await api.poll(state.st.cursor, status());
  // How far this PC's clock is from the server's (scan times are the server's).
  const skew = Date.parse(d.now) - (t0 + Date.now()) / 2;
  offset = Math.abs(skew) > 1500 ? Math.round(skew) : 0;
  settings = d.settings; dropbox = d.dropbox; playSecret = d.play_secret; deletes = d.deletes || [];
  syncRecorders(settings.enabled ? d.cameras : []);
  const added = state.ingest(d.scans || []);
  if (added) log(`${added} new scan(s)`);
}

async function report() {
  const rows = state.unreported();
  const del = deleted.splice(0); const bad = deleteFailed.splice(0);
  if (!rows.length && !del.length && !bad.length) return;
  try {
    await api.report(rows.map(({ _rev, ...r }) => r), del, bad);
    state.reported(rows);
  } catch (e) { deleted.unshift(...del); deleteFailed.unshift(...bad); throw e; }
}

function housekeeping(now) {
  // Keep `buffer_hours` of recording, but never a piece a waiting clip still needs.
  const s = settings || {};
  const low = (diskInfo(cfg.data_dir).free_gb ?? 99) < 3;
  let before = now - (low ? 1 : Math.max(1, Number(s.buffer_hours) || 6)) * 3600_000;
  for (const j of state.pending()) if (j.status === 'queued') before = Math.min(before, Date.parse(j.scanned_at) - offset - (Number(s.pre_roll_seconds) || 0) * 1000 - 120_000);
  let total = 0;
  const segRoot = path.join(cfg.data_dir, 'segments');
  for (const d of fs.readdirSync(segRoot)) {
    const dir = path.join(segRoot, d);
    if (prune(dir, before) && low) lastError = 'Disk almost full — keeping only 1 hour of recording';
    total += dirBytes(dir);
  }
  bufferBytes = total;
  for (const [id, t] of deleteHandled) if (now - t > 10 * 60_000) deleteHandled.delete(id);
  state.tidy(now);
}

async function checkInLoop() {
  let lastHouse = 0;
  for (;;) {
    try {
      await checkIn();
      await report();
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
      for (const d of deletes) {
        if (deleteHandled.has(d.id)) continue;
        deleteHandled.set(d.id, Date.now());
        busy = true;
        try { await removeClip(ctx, d); deleted.push(d.id); log(`deleted clip ${d.id}`); }
        catch (e) { deleteFailed.push({ id: d.id, error: e.message }); log(`delete ${d.id}: ${e.message}`); }
      }
      for (const job of state.pending()) {
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
startServer(cfg, {
  secret: () => playSecret,
  clipFile: id => state.st.files[id] || null,
  status: () => ({ ...status(), server_ok: serverOk }),
  drive,
});
checkInLoop();
workLoop();
