// One step of work at a time: cut a clip or upload it. Each scan's job goes
// queued → uploading → done (or missing / failed); every change is reported
// to the server on the next round. A clip marked to be cut again (a late
// scan inside it, or "+30 s" after it stopped) goes back to queued first.
// Every upload's outcome is kept per place (ctx.uploadResult), so the
// status shows "uploads failing" instead of "Ready" when they do. Clips are never deleted by Pack Cam —
// the team removes them from the PC folder, Dropbox or Drive themselves.
import fs from 'node:fs';
import path from 'node:path';
import { cutClip, readyToCut, windowFor } from './clipper.mjs';
import { cameraDir, listSegments } from './segments.mjs';
import { dropboxUpload } from './dropbox.mjs';
import { localDate, localTime, log, safeName } from './util.mjs';

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

/**
 * The PC folder for clips: the one set in Settings → Pack Cam, or the agent's
 * own clips folder. A folder that cannot be used (drive missing, no write
 * access) falls back to the agent's own and says so on the status page.
 */
function clipsRoot(ctx, s) {
  const fallback = path.join(ctx.cfg.data_dir, 'clips');
  const want = String(s.pc_folder || '').trim();
  ctx.setFolderWarning('');
  if (!want) return fallback;
  try { fs.mkdirSync(want, { recursive: true }); fs.accessSync(want, fs.constants.W_OK); return path.resolve(want); }
  catch (e) { ctx.setFolderWarning(`PC folder "${want}" cannot be used (${e.code || e.message}) — saving to ${fallback}`); return fallback; }
}

/**
 * <PC folder>/<date>/<tracking ID>.mp4. The same tracking ID twice on one day
 * (scanned on two courier sheets, or rescanned after an undo) gets the scan
 * time added — a clip never replaces another.
 */
function clipFile(ctx, s, job) {
  const at = new Date(Date.parse(job.scanned_at));
  const day = localDate(at);
  const base = safeName(job.awb);
  const dir = path.join(clipsRoot(ctx, s), day);
  const taken = fs.existsSync(path.join(dir, `${base}.mp4`))
    || Object.values(ctx.state.st.jobs).some(j => j.id !== job.id && j.name === `${base}.mp4` && j.day === day);
  job.day = day;
  job.name = taken ? `${base}_${localTime(at)}.mp4` : `${base}.mp4`;
  return path.join(dir, job.name);
}

/** Move a file, across drives too. */
function move(from, to) {
  try { fs.renameSync(from, to); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(from, to); fs.unlinkSync(from); }
}

/**
 * Cut a clip again (a late scan falls inside it, or time was added after it
 * stopped). The new version is cut first, into the data folder; only once
 * that worked does it replace the old file and get uploaded over the old
 * Dropbox file (same name) — the old Drive copy is removed after the new one
 * is up. With the recording no longer all there, the old video is kept.
 */
async function recutStep(ctx, job, now, s) {
  const { cfg, state } = ctx;
  const scanMs = Date.parse(job.scanned_at) - ctx.offset();
  const next = state.nextScanMs(job);
  const nextMs = next == null ? null : next - ctx.offset();
  const win = windowFor(scanMs, nextMs, s, (Number(job.extend) || 0) * 1000);
  const segs = listSegments(cameraDir(cfg.data_dir, job.camera));
  const keep = why => { log(`clip ${job.awb}: not cut again (${why}) — the earlier video is kept`); job.recut = null; state.touch(); return true; };
  if (!segs.length || segs[0].start > win.start) return keep('its recording is no longer on the PC');
  if (!readyToCut(win, nextMs != null, segs, now)) return false;
  const name = job.name || path.basename(job.file || job.pc_path || `${safeName(job.awb)}.mp4`);
  const tmp = path.join(cfg.data_dir, 'tmp', `recut-${job.id}`, name);
  let r;
  try { r = await cutClip(cfg, { id: job.id, camera: job.camera }, win, tmp); }
  catch (e) {
    // A failed cut never touches the video already there: try again in a minute, three times.
    try { fs.unlinkSync(tmp); } catch { /* never made */ }
    if ((job.recut_tries = (job.recut_tries || 0) + 1) >= 3) return keep(e.message);
    job.next_try = now + 60_000; state.touch();
    return true;
  }
  if (r.missing) return keep(r.missing);
  const t = job.targets || { pc: true };
  const old = job.pc_path || job.file;
  const final = t.pc && old ? old : tmp;
  if (final !== tmp) { try { fs.unlinkSync(final); } catch { /* already gone */ } move(tmp, final); }
  Object.assign(job, {
    recut: null, recut_tries: 0, recuts: (job.recuts || 0) + 1, status: 'uploading', file: final, pc_path: t.pc ? final : null,
    start: new Date(Date.parse(r.start) + ctx.offset()).toISOString(), end: new Date(Date.parse(r.end) + ctx.offset()).toISOString(),
    duration: r.duration, size: r.size, capped: !!win.capped, attempts: 0, next_try: 0, error: null,
    // The old cloud copies stay linked (and playable) until the new ones are up.
    reup_dropbox: !!(t.dropbox && job.dropbox_path), reup_gdrive: !!(t.gdrive && job.gdrive_file_id), old_gdrive_id: job.gdrive_file_id || null,
  });
  if (t.pc) state.st.files[job.id] = final;
  state.mark(job);
  log(`clip ${job.awb}: cut again, ${r.duration}s`);
  return true;
}

/** Do the next step for `job` if it is due. Returns true when it did something. */
export async function step(ctx, job, now) {
  const { cfg, state } = ctx;
  if (job.next_try > now) return false;
  const s = ctx.settings();
  if (!s) return false;
  try {
    if (job.recut) return await recutStep(ctx, job, now, s);
    if (job.status === 'queued') {
      // Scan times are the server's clock; the recording is named by this PC's.
      const scanMs = Date.parse(job.scanned_at) - ctx.offset();
      const next = state.nextScanMs(job);
      const nextMs = next == null ? null : next - ctx.offset();
      const extend = Number(job.extend) || 0;
      const win = windowFor(scanMs, nextMs, s, extend * 1000);
      if (!readyToCut(win, nextMs != null, listSegments(cameraDir(cfg.data_dir, job.camera)), now)) return false;
      const out = clipFile(ctx, s, job);
      const r = await cutClip(cfg, { id: job.id, camera: job.camera }, win, out);
      // "+30 s" or the packer's next scan can arrive while it is being cut
      // (a conversion takes minutes): then it is cut again right after.
      const nextNow = state.nextScanMs(job);
      const changed = (win.capped && (Number(job.extend) || 0) > extend) || (nextNow != null && nextNow !== next && nextNow - ctx.offset() < win.end);
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
        duration: r.duration, size: r.size, pc_path: t.pc ? r.file : null, capped: !!win.capped,
        dropbox_folder: clean(s.dropbox_folder), gdrive_folder: s.gdrive_folder_name || 'PackCam',
      });
      if (t.pc) state.st.files[job.id] = r.file;
      if (changed && (job.recuts || 0) < 3) job.recut = 'it changed while it was being cut';
      state.mark(job);
      log(`clip ${job.awb}: cut ${r.duration}s, ${(r.size / 1e6).toFixed(1)} MB`);
      return true;
    }
    if (job.status === 'uploading') {
      if (!job.file || !fs.existsSync(job.file)) throw new Error('The cut clip is missing from the PC');
      const date = localDate(new Date(Date.parse(job.scanned_at)));
      if (job.targets.dropbox && (!job.dropbox_path || job.reup_dropbox)) {
        const tok = ctx.dropbox();
        if (!tok?.access_token) throw new Error(tok?.error || 'Waiting for the Dropbox login from the server');
        try { job.dropbox_path = await dropboxUpload(tok.access_token, job.file, `${job.dropbox_folder}/${date}/${path.basename(job.file)}`); }
        catch (e) { ctx.uploadResult('dropbox', e); throw e; }
        ctx.uploadResult('dropbox', null);
        job.reup_dropbox = false;
        state.mark(job);
        return true;
      }
      if (job.targets.gdrive && (!job.gdrive_file_id || job.reup_gdrive)) {
        let g;
        try { g = await ctx.drive.upload(job.file, job.gdrive_folder, date); }
        catch (e) { ctx.uploadResult('gdrive', e); throw e; }
        ctx.uploadResult('gdrive', null);
        Object.assign(job, { gdrive_file_id: g.id, gdrive_link: g.link, reup_gdrive: false });
        // A video cut again: its earlier Drive copy goes once the new one is up.
        if (job.old_gdrive_id && job.old_gdrive_id !== g.id) {
          try { await ctx.drive.remove(job.old_gdrive_id); job.old_gdrive_id = null; }
          catch (e) { log(`clip ${job.awb}: the earlier Drive copy stays (${e.message})`); }
        }
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
