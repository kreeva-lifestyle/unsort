// Turning a scan into a clip.
//
// Window: from the scan (minus a few seconds of pre-roll) to the next scan
// on the same camera (plus a little post-roll), never longer than the cap.
// A clip is cut once the recording has moved past its end; if the next scan
// has not happened, it waits until the cap runs out.
// The cut is a stream copy from the one-minute pieces (the camera's own
// quality); the recorder already made the audio AAC. H.264 video is kept as
// it is. H.265 (HEVC) does not play in most browsers or phones, so such a
// clip is converted to H.264 once, after the cut.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { covering, listSegments, cameraDir } from './segments.mjs';

/**
 * The clip window for a scan, given the next scan on its camera (or null).
 * max_clip_seconds is the length of the whole video, pre- and post-roll
 * included: it runs from pre-roll before the scan to post-roll after the next
 * scan, or stops at the limit, whichever comes first.
 */
export function windowFor(scanMs, nextMs, s) {
  const pre = Math.max(0, Number(s.pre_roll_seconds) || 0) * 1000;
  const post = Math.max(0, Number(s.post_roll_seconds) || 0) * 1000;
  // Never so short that the video could end before (or just after) the scan.
  const cap = Math.max(10_000 + pre, (Number(s.max_clip_seconds) || 600) * 1000);
  const start = scanMs - pre;
  const end = nextMs != null && nextMs > scanMs ? Math.min(nextMs + post, start + cap) : start + cap;
  return { start, end, scan: scanMs, limit: cap, capped: end === start + cap };
}

/**
 * Ready to cut? The window is closed (next scan known or cap passed) and the
 * recording has a piece that starts after the window ends (so the piece
 * holding the end is finished) — or 2 minutes have passed (camera down: cut
 * what exists, or report it missing).
 */
export function readyToCut(win, nextKnown, segs, now) {
  if (!nextKnown && now < win.end) return false;
  if (segs.some(s => s.start > win.end)) return true;
  return now > win.end + 120_000;
}

// low: below-normal priority, so a long conversion never slows the recording.
const run = (bin, args, timeout, low = false) => new Promise((resolve, reject) => {
  const child = execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
    if (err) reject(new Error((String(stderr).trim().split('\n').pop() || err.message).replace(/rtsp:\/\/[^@\s]*@/g, 'rtsp://***@')));
    else resolve(String(stdout));
  });
  if (low && child.pid) try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed: normal priority */ }
});

/** A piece's first timestamp in seconds (MPEG-TS pieces start near 1.4 s, not 0). */
async function startOf(cfg, file) {
  try {
    const out = await run(cfg.ffprobe, ['-v', 'error', '-show_entries', 'format=start_time', '-of', 'json', file], 30_000);
    return Number(JSON.parse(out).format?.start_time) || 0;
  } catch { return 0; }
}

/**
 * Where a stream copy starting near `t` (a timestamp inside the piece) can
 * start: it must be a keyframe, or the picture is missing until the next one
 * while the sound plays on. The first keyframe from `t` up to `latest` (still
 * inside the pre-roll, so the scan is in the video and nothing is added), else
 * the last one before `t`. Null if the piece cannot be read.
 */
async function keyframeNear(cfg, file, t, latest) {
  try {
    const out = await run(cfg.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', file], 60_000);
    let before = null, after = null;
    for (const line of out.split('\n')) {
      const [pts, flags] = line.trim().split(',');
      const v = Number(pts);
      if (!flags?.includes('K') || !Number.isFinite(v)) continue;
      if (v <= t + 0.0005) { if (before == null || v > before) before = v; }
      else if (v <= latest && (after == null || v < after)) after = v;
    }
    return after ?? before;
  } catch { return null; }
}

export async function probe(cfg, file) {
  const out = await run(cfg.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file], 30_000);
  const d = JSON.parse(out);
  const video = (d.streams || []).find(x => x.codec_type === 'video');
  return { duration: Number(d.format?.duration) || 0, vcodec: video?.codec_name || null, hasAudio: (d.streams || []).some(x => x.codec_type === 'audio') };
}

/**
 * Cut the clip for `scan` ({ id, camera }) covering `win` into the file `out`.
 * Returns { file, start, end, duration, size } or { missing: reason }.
 */
export async function cutClip(cfg, scan, win, out) {
  const segs = covering(listSegments(cameraDir(cfg.data_dir, scan.camera)), win.start, win.end);
  if (!segs.length) return { missing: 'No recording for this time — the camera was not recording, or the clip is older than the recording buffer' };
  // Each piece is trimmed on its own timeline (inpoint/outpoint), so a gap in
  // the recording drops out of the clip instead of shifting the footage. The
  // concat demuxer reads inpoint/outpoint as timestamps inside the piece, and
  // MPEG-TS pieces do not start at 0 (the muxer adds ~1.4 s), so each piece's
  // own start time is added. The first and last pieces are only trimmed where
  // the window cuts them; whole pieces in between are taken as they are. The
  // start moves to a keyframe (see keyframeNear), so picture and sound start
  // together.
  const parts = [];
  for (const sg of segs) {
    let a = Math.max(win.start, sg.start); const b = Math.min(win.end, sg.end);
    if (b - a < 200) continue;
    const t0 = await startOf(cfg, sg.file);
    let inpoint = a > sg.start ? t0 + (a - sg.start) / 1000 : null;
    if (inpoint != null) {
      const latest = t0 + (Math.min(win.scan ?? a, b) - sg.start) / 1000;
      const k = await keyframeNear(cfg, sg.file, inpoint, latest);
      if (k != null) { a = Math.max(sg.start, sg.start + (k - t0) * 1000); inpoint = k > t0 + 0.0005 ? k : null; }
    }
    parts.push({ file: sg.file, a, b, inpoint, t0, segStart: sg.start, segEnd: sg.end });
  }
  // Only when there was no keyframe in the pre-roll and the start moved back
  // can a video run past the limit: take that extra off the end. A video
  // under the limit keeps its whole end (the moment after the next scan).
  let over = win.limit ? parts.reduce((n, p) => n + (p.b - p.a), 0) - win.limit : 0;
  while (over > 0 && parts.length) {
    const last = parts[parts.length - 1];
    const cut = Math.min(over, last.b - last.a);
    last.b -= cut; over -= cut;
    if (last.b - last.a < 200) parts.pop();
  }
  for (const p of parts) p.outpoint = p.b < p.segEnd ? p.t0 + (p.b - p.segStart) / 1000 : null;
  if (!parts.length) return { missing: 'Less than a second of recording covers this scan' };
  const realStart = parts[0].a;
  const realEnd = parts[parts.length - 1].b;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const list = path.join(cfg.data_dir, 'tmp', `${scan.id}.txt`);
  fs.writeFileSync(list, parts.map(p => [`file '${p.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`,
    // Rounded down so the keyframe the inpoint sits on is never skipped.
    p.inpoint != null ? `inpoint ${(Math.floor(p.inpoint * 1000) / 1000).toFixed(3)}` : '', p.outpoint != null ? `outpoint ${p.outpoint.toFixed(3)}` : ''].filter(Boolean).join('\n')).join('\n'));
  const tmpOut = out + '.part.mp4';
  const tmpCopy = out + '.copy.mp4';
  try {
    await run(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', list,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', tmpCopy], 15 * 60_000);
    // The codec is read from the cut itself; if that fails the cut fails and
    // is retried, rather than an H.265 clip being saved unplayable.
    const cut = await probe(cfg, tmpCopy);
    if (cut.vcodec === 'h264') fs.renameSync(tmpCopy, out);
    else {
      // Frame timing passed through as cut; given 6× the clip's length (a
      // slow PC) and at least 10 minutes before it counts as stuck.
      await run(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmpCopy,
        '-map', '0:v:0', '-map', '0:a?', '-fps_mode', 'passthrough', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy', '-movflags', '+faststart', tmpOut], Math.max(10 * 60_000, cut.duration * 6000), true);
      fs.renameSync(tmpOut, out);
    }
  } finally {
    try { fs.unlinkSync(list); } catch { /* gone */ }
    try { fs.unlinkSync(tmpOut); } catch { /* renamed or never made */ }
    try { fs.unlinkSync(tmpCopy); } catch { /* renamed or converted */ }
  }
  const meta = await probe(cfg, out).catch(() => ({ duration: (realEnd - realStart) / 1000 }));
  return { file: out, start: new Date(realStart).toISOString(), end: new Date(realEnd).toISOString(), duration: Math.round((meta.duration || 0) * 10) / 10, size: fs.statSync(out).size };
}
