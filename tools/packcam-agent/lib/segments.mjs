// The rolling recording on disk: segments/<camera>/<YYYYMMDD-HHMMSS>.ts, one
// file a minute per camera, named by the PC's local clock when ffmpeg opened
// it. A segment runs from its name time to the next segment's name time
// (the newest one: to its last write).
import fs from 'node:fs';
import path from 'node:path';

const NAME = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.ts$/;

export function cameraDir(dataDir, number) {
  const d = path.join(dataDir, 'segments', `cam${String(number).replace(/[^A-Za-z0-9_-]/g, '_')}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Segments of one camera, oldest first: { file, start, end } in ms. */
export function listSegments(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const segs = [];
  for (const n of names) {
    const m = NAME.exec(n);
    if (!m) continue;
    const start = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    segs.push({ file: path.join(dir, n), start, end: 0 });
  }
  segs.sort((a, b) => a.start - b.start);
  for (let i = 0; i < segs.length; i++) {
    if (i + 1 < segs.length) segs[i].end = segs[i + 1].start;
    else { try { segs[i].end = fs.statSync(segs[i].file).mtimeMs; } catch { segs[i].end = segs[i].start; } }
  }
  return segs;
}

/** Segments that overlap [from, to] (ms). */
export const covering = (segs, from, to) => segs.filter(s => s.end > from && s.start < to);

/** Delete segments that ended before `before` (ms); returns bytes freed. */
export function prune(dir, before) {
  let freed = 0;
  for (const s of listSegments(dir)) {
    if (s.end >= before) break;
    try { freed += fs.statSync(s.file).size; fs.unlinkSync(s.file); } catch { /* in use or gone */ }
  }
  return freed;
}

export function dirBytes(dir) {
  let n = 0;
  try { for (const f of fs.readdirSync(dir)) { try { n += fs.statSync(path.join(dir, f)).size; } catch { /* gone */ } } } catch { /* none */ }
  return n;
}
