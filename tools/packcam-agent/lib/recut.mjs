// Cutting a clip again: a scan learnt of late falls inside it, or the
// packer added time ("+30 s") after it stopped, or either changed while it
// was being cut. Used by the worker for a job with job.recut set.
import fs from 'node:fs';
import path from 'node:path';
import { cutClip, readyToCut, windowFor } from './clipper.mjs';
import { cameraDir, listSegments } from './segments.mjs';
import { log, safeName } from './util.mjs';

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
export async function recutStep(ctx, job, now, s, clipFile) {
  const { cfg, state } = ctx;
  const scanMs = Date.parse(job.scanned_at) - ctx.offset();
  const next = state.nextScanMs(job);
  const nextMs = next == null ? null : next - ctx.offset();
  const extendUsed = Number(job.extend) || 0;
  const win = windowFor(scanMs, nextMs, s, extendUsed * 1000);
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
  // The new version takes the old file's place (PC folder, or the clips
  // folder a cloud-only clip waits in); a PC copy removed by hand gets its
  // usual place; a cloud-only clip already uploaded stays in the data folder.
  const old = [job.file, job.pc_path].find(f => f && fs.existsSync(f)) || null;
  const final = old || (t.pc ? clipFile(ctx, s, job) : tmp);
  if (final !== tmp) {
    // Next to the target first (across drives too), then one rename over it:
    // the old video is never gone before the new one is in place.
    const side = final + '.new';
    try { fs.mkdirSync(path.dirname(final), { recursive: true }); move(tmp, side); fs.renameSync(side, final); }
    catch (e) {
      for (const f of [tmp, side]) { try { fs.unlinkSync(f); } catch { /* not there */ } }
      if ((job.recut_tries = (job.recut_tries || 0) + 1) >= 3) return keep(`could not replace it: ${e.message}`);
      job.next_try = now + 60_000; state.touch();
      return true;
    }
  }
  const pcCopy = !!(job.pc_path || t.pc);
  // Changed again while this cut ran ("+30 s", the packer's next scan): once more.
  const post = (Number(s.post_roll_seconds) || 0) * 1000;
  const nextNow = state.nextScanMs(job);
  const again = (win.capped && (Number(job.extend) || 0) > extendUsed) || (nextNow != null && nextNow !== next && nextNow - ctx.offset() < win.end - post - 2000);
  Object.assign(job, {
    recut: again && (job.recuts || 0) + 1 < 3 ? 'it changed while it was being cut' : null, recut_tries: 0, recuts: (job.recuts || 0) + 1, status: 'uploading', file: final, pc_path: pcCopy ? final : null,
    start: new Date(Date.parse(r.start) + ctx.offset()).toISOString(), end: new Date(Date.parse(r.end) + ctx.offset()).toISOString(),
    duration: r.duration, size: r.size, capped: !!win.capped, attempts: 0, next_try: 0, error: null,
    // The old cloud copies stay linked (and playable) until the new ones are up.
    reup_dropbox: !!(t.dropbox && job.dropbox_path), reup_gdrive: !!(t.gdrive && job.gdrive_file_id), old_gdrive_id: job.gdrive_file_id || null,
  });
  if (pcCopy) state.st.files[job.id] = final;
  state.mark(job);
  log(`clip ${job.awb}: cut again, ${r.duration}s`);
  return true;
}

