// Turning a scan into a clip.
//
// Window: from the scan (minus a few seconds of pre-roll) to the next scan
// on the same camera (plus a little post-roll), never longer than the cap.
// A clip is cut once the recording has moved past its end; if the next scan
// has not happened, it waits until the cap runs out.
// The cut is a stream copy from the one-minute pieces (no re-encoding, the
// camera's own quality); the recorder already made the audio AAC.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { covering, listSegments, cameraDir } from './segments.mjs';
import { localDate, localTime, safeName } from './util.mjs';

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

const run = (bin, args, timeout) => new Promise((resolve, reject) => {
  execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
    if (err) reject(new Error((String(stderr).trim().split('\n').pop() || err.message).replace(/rtsp:\/\/[^@\s]*@/g, 'rtsp://***@')));
    else resolve(String(stdout));
  });
});

export async function probe(cfg, file) {
  const out = await run(cfg.ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file], 30_000);
  const d = JSON.parse(out);
  const video = (d.streams || []).find(x => x.codec_type === 'video');
  return { duration: Number(d.format?.duration) || 0, vcodec: video?.codec_name || null, hasAudio: (d.streams || []).some(x => x.codec_type === 'audio') };
}

/**
 * Cut the clip for `scan` ({ id, awb, camera, scanned_at }) covering `win`.
 * Returns { file, start, end, duration, size } or { missing: reason }.
 */
export async function cutClip(cfg, scan, win) {
  const segs = covering(listSegments(cameraDir(cfg.data_dir, scan.camera)), win.start, win.end);
  if (!segs.length) return { missing: 'No recording for this time — the camera was not recording, or the clip is older than the recording buffer' };
  const first = segs[0];
  const realStart = Math.max(win.start, first.start);
  const realEnd = Math.min(win.end, segs[segs.length - 1].end);
  if (realEnd - realStart < 1000) return { missing: 'Less than a second of recording covers this scan' };

  const at = new Date(Date.parse(scan.scanned_at));
  const dir = path.join(cfg.data_dir, 'clips', localDate(at));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${safeName(scan.awb)}_cam${safeName(scan.camera)}_${localTime(at)}.mp4`;
  const out = path.join(dir, name);
  const list = path.join(cfg.data_dir, 'tmp', `${scan.id}.txt`);
  fs.writeFileSync(list, segs.map(s => `file '${s.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  const info = await probe(cfg, segs[0].file).catch(() => ({ vcodec: null, hasAudio: true }));
  const tmpOut = out + '.part.mp4';
  try {
    await run(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-ss', ((realStart - first.start) / 1000).toFixed(2), '-i', list,
      '-t', ((realEnd - realStart) / 1000).toFixed(2),
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy', ...(info.vcodec === 'hevc' ? ['-tag:v', 'hvc1'] : []),
      '-c:a', 'copy', '-movflags', '+faststart', tmpOut], 15 * 60_000);
    fs.renameSync(tmpOut, out);
  } finally {
    try { fs.unlinkSync(list); } catch { /* gone */ }
    try { fs.unlinkSync(tmpOut); } catch { /* renamed or never made */ }
  }
  const meta = await probe(cfg, out).catch(() => ({ duration: (realEnd - realStart) / 1000 }));
  return { file: out, start: new Date(realStart).toISOString(), end: new Date(realEnd).toISOString(), duration: Math.round((meta.duration || 0) * 10) / 10, size: fs.statSync(out).size };
}
