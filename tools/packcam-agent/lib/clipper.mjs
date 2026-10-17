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

/** The clip window for a scan, given the next scan on its camera (or null). */
export function windowFor(scanMs, nextMs, s) {
  const cap = Math.max(10, Number(s.max_clip_seconds) || 600) * 1000;
  const pre = Math.max(0, Number(s.pre_roll_seconds) || 0) * 1000;
  const post = Math.max(0, Number(s.post_roll_seconds) || 0) * 1000;
  const until = nextMs != null && nextMs > scanMs ? Math.min(nextMs, scanMs + cap) : scanMs + cap;
  return { start: scanMs - pre, end: until + post, capped: nextMs == null || nextMs - scanMs > cap };
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
  // the window cuts them; whole pieces in between are taken as they are.
  const parts = [];
  for (const sg of segs) {
    const a = Math.max(win.start, sg.start); const b = Math.min(win.end, sg.end);
    if (b - a < 200) continue;
    const t0 = await startOf(cfg, sg.file);
    parts.push({ file: sg.file, a, b,
      inpoint: a > sg.start ? t0 + (a - sg.start) / 1000 : null,
      outpoint: b < sg.end ? t0 + (b - sg.start) / 1000 : null });
  }
  if (!parts.length) return { missing: 'Less than a second of recording covers this scan' };
  const realStart = parts[0].a;
  const realEnd = parts[parts.length - 1].b;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const list = path.join(cfg.data_dir, 'tmp', `${scan.id}.txt`);
  fs.writeFileSync(list, parts.map(p => [`file '${p.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`,
    p.inpoint != null ? `inpoint ${p.inpoint.toFixed(3)}` : '', p.outpoint != null ? `outpoint ${p.outpoint.toFixed(3)}` : ''].filter(Boolean).join('\n')).join('\n'));
  const info = await probe(cfg, parts[0].file).catch(() => ({ vcodec: null }));
  const convert = !!info.vcodec && info.vcodec !== 'h264';
  const tmpOut = out + '.part.mp4';
  const tmpCopy = out + '.copy.mp4';
  try {
    await run(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', list,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy', ...(info.vcodec === 'hevc' ? ['-tag:v', 'hvc1'] : []),
      '-c:a', 'copy', '-movflags', '+faststart', convert ? tmpCopy : tmpOut], 15 * 60_000);
    // Converted from the finished cut, not from the pieces: the cut's edit
    // list already hides the frames before the scan, and decoding honours it,
    // so the converted clip starts on the same frame.
    if (convert) {
      await run(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmpCopy,
        '-map', '0:v:0', '-map', '0:a?', '-fps_mode', 'passthrough', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'copy', '-movflags', '+faststart', tmpOut], 60 * 60_000, true);
    }
    fs.renameSync(tmpOut, out);
  } finally {
    try { fs.unlinkSync(list); } catch { /* gone */ }
    try { fs.unlinkSync(tmpOut); } catch { /* renamed or never made */ }
    try { fs.unlinkSync(tmpCopy); } catch { /* not converted */ }
  }
  const meta = await probe(cfg, out).catch(() => ({ duration: (realEnd - realStart) / 1000 }));
  return { file: out, start: new Date(realStart).toISOString(), end: new Date(realEnd).toISOString(), duration: Math.round((meta.duration || 0) * 10) / 10, size: fs.statSync(out).size };
}
