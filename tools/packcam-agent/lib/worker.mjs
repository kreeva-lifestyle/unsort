// One step of work at a time: cut a clip or upload it. Each scan's job goes
// queued → uploading → done (or missing / failed); every change is reported
// to the server on the next round. Clips are never deleted by Pack Cam —
// the team removes them from the PC folder, Dropbox or Drive themselves.
import fs from 'node:fs';
import path from 'node:path';
import { cutClip, readyToCut, windowFor } from './clipper.mjs';
import { cameraDir, listSegments } from './segments.mjs';
import { dropboxUpload } from './dropbox.mjs';
import { localDate, log } from './util.mjs';

const MAX_ATTEMPTS = 8;
const clean = folder => '/' + String(folder || '/PackCam').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

function failed(ctx, job, e, now) {
  const error = String(e?.message || e).slice(0, 400);
  const changed = error !== job.error;
  job.attempts = (job.attempts || 0) + 1;
  job.error = error;
  const cut = job.file && fs.existsSync(job.file);
  if (job.status === 'uploading' && cut && !e?.permanent) {
    // An upload does not give up while the cut clip is on this PC (Dropbox not
    // connected yet, internet down…): it retries every 30 minutes at most.
    // After a few failures the PC copy is offered so the clip can be watched.
    // Errors a retry cannot fix (Dropbox/Drive full) fail at once instead.
    job.next_try = now + Math.min(60_000 * 2 ** (job.attempts - 1), 30 * 60_000);
    if (job.attempts >= 3 && !job.pc_path) { job.pc_path = job.file; ctx.state.st.files[job.id] = job.file; ctx.state.mark(job); }
    else if (changed) ctx.state.mark(job);
  } else if (e?.permanent || job.attempts >= MAX_ATTEMPTS) {
    job.status = 'failed';
    if (cut) { job.pc_path = job.file; ctx.state.st.files[job.id] = job.file; }
    ctx.state.mark(job);
  } else {
    job.next_try = now + Math.min(60_000 * 2 ** (job.attempts - 1), 30 * 60_000);
    if (changed) ctx.state.mark(job);
  }
  log(`clip ${job.awb}: ${error} (try ${job.attempts})`);
}

/** Do the next step for `job` if it is due. Returns true when it did something. */
export async function step(ctx, job, now) {
  if (job.next_try > now) return false;
  const { cfg, state } = ctx;
  const s = ctx.settings();
  if (!s) return false;
  try {
    if (job.status === 'queued') {
      // Scan times are the server's clock; the recording is named by this PC's.
      const scanMs = Date.parse(job.scanned_at) - ctx.offset();
      const next = state.nextScanMs(job);
      const nextMs = next == null ? null : next - ctx.offset();
      const win = windowFor(scanMs, nextMs, s);
      if (!readyToCut(win, nextMs != null, listSegments(cameraDir(cfg.data_dir, job.camera)), now)) return false;
      const r = await cutClip(cfg, { id: job.id, awb: job.awb, camera: job.camera, scanned_at: job.scanned_at }, win);
      if (r.missing) {
        Object.assign(job, { status: 'missing', error: r.missing });
        state.mark(job);
        log(`clip ${job.awb}: ${r.missing}`);
        return true;
      }
      const t = { pc: !!s.targets?.pc, dropbox: !!s.targets?.dropbox, gdrive: !!s.targets?.gdrive };
      if (!t.pc && !t.dropbox && !t.gdrive) t.pc = true;   // never cut a clip into nowhere
      Object.assign(job, {
        status: 'uploading', file: r.file, targets: t, attempts: 0, next_try: 0, error: null,
        start: new Date(Date.parse(r.start) + ctx.offset()).toISOString(), end: new Date(Date.parse(r.end) + ctx.offset()).toISOString(),
        duration: r.duration, size: r.size, pc_path: t.pc ? r.file : null,
        dropbox_folder: clean(s.dropbox_folder), gdrive_folder: s.gdrive_folder_name || 'PackCam',
      });
      if (t.pc) state.st.files[job.id] = r.file;
      state.mark(job);
      log(`clip ${job.awb}: cut ${r.duration}s, ${(r.size / 1e6).toFixed(1)} MB`);
      return true;
    }
    if (job.status === 'uploading') {
      if (!job.file || !fs.existsSync(job.file)) throw new Error('The cut clip is missing from the PC');
      const date = localDate(new Date(Date.parse(job.scanned_at)));
      if (job.targets.dropbox && !job.dropbox_path) {
        const tok = ctx.dropbox();
        if (!tok?.access_token) throw new Error(tok?.error || 'Waiting for the Dropbox login from the server');
        job.dropbox_path = await dropboxUpload(tok.access_token, job.file, `${job.dropbox_folder}/${date}/${path.basename(job.file)}`);
        state.mark(job);
        return true;
      }
      if (job.targets.gdrive && !job.gdrive_file_id) {
        const g = await ctx.drive.upload(job.file, job.gdrive_folder, date);
        Object.assign(job, { gdrive_file_id: g.id, gdrive_link: g.link });
        state.mark(job);
        return true;
      }
      if (!job.targets.pc) {
        try { fs.unlinkSync(job.file); } catch { /* already gone */ }
        job.pc_path = null; delete state.st.files[job.id];
      }
      Object.assign(job, { status: 'done', error: null, attempts: 0 });
      state.mark(job);
      log(`clip ${job.awb}: saved${job.targets.pc ? ' · PC' : ''}${job.dropbox_path ? ' · Dropbox' : ''}${job.gdrive_file_id ? ' · Drive' : ''}`);
      return true;
    }
  } catch (e) {
    failed(ctx, job, e, now);
    return true;
  }
  return false;
}
