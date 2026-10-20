// End-to-end test of the agent with no cameras and no cloud: a local video
// file plays the camera, and one local server stands in for the packcam
// function, Dropbox and Google Drive. The server's clock runs 30 s ahead of
// this machine's, to prove clips line up when the PC clock is off.
//   node test/run.mjs        (needs ffmpeg + ffprobe on PATH)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'packcam-test-'));
const SKEW = 30_000; const KEY = 'pcam_' + 'a'.repeat(48); const SECRET = 'b'.repeat(64);
const AGENT_PORT = 18765 + Math.floor(Math.random() * 1000);
const sNow = () => Date.now() + SKEW;
const iso = ms => new Date(ms).toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failures++; };

// A 40 s "camera": H.264 picture + G.711 sound, like a Hikvision main stream.
const video = path.join(tmp, 'camera.mkv');
execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000',
  '-t', '40', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25', '-c:a', 'pcm_mulaw', video]);

// ---- clips hold the right footage, and a recording gap does not shift it ----
// Each test frame's brightness is its frame number × 2, so the frame that
// starts a clip tells exactly which moment of the recording it came from.
// Run for an H.264 camera (copied) and an H.265 camera (converted to H.264).
// Keyframes every 30 frames (1.2 s) and a scan between two of them: the
// clip must start on the keyframe before the scan, picture and sound together.
for (const [enc, tag] of [['libx264', 'H.264'], ['libx265', 'H.265']]) {
  process.env.PACKCAM_SEGMENT_SECONDS = '4';
  const { cutClip } = await import('../lib/clipper.mjs');
  const { cameraDir } = await import('../lib/segments.mjs');
  const gd = path.join(tmp, 'gap-' + enc); fs.mkdirSync(path.join(gd, 'tmp'), { recursive: true });
  const dir = cameraDir(gd, '9');
  const t0 = new Date(2026, 0, 5, 10, 0, 0).getTime();
  const name = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.ts`; };
  const piece = (start, base) => {
    const f = path.join(dir, name(start));
    // Same muxer as the recorder: the segment muxer writing MPEG-TS (pieces start at ~1.4 s).
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=64x64:r=25,format=gray,geq=lum='${base}+N*2'`, '-f', 'lavfi', '-i', 'sine',
      '-t', '4', '-c:v', enc, '-preset', 'ultrafast', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', ...(enc === 'libx265' ? ['-x265-params', 'log-level=error:bframes=0:scenecut=0:min-keyint=30'] : []), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'segment', '-segment_time', '60', '-segment_format', 'mpegts', '-reset_timestamps', '1', path.join(gd, 'piece%d.ts')]);
    fs.renameSync(path.join(gd, 'piece0.ts'), f);
    fs.utimesSync(f, new Date(start + 4000), new Date(start + 4000));
  };
  piece(t0, 0);                 // frames 0..99 → brightness 0..198
  piece(t0 + 10_000, 40);       // after a 6 s hole (camera dropped out): brightness 40..238
  fs.writeFileSync(path.join(dir, name(t0 + 30_000)), '');   // a later piece: the window is closed
  const lumAt = (file, frame) => execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])[0];
  const r = await cutClip({ data_dir: gd, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }, { id: 'g1', camera: '9' }, { start: t0 + 2000, end: t0 + 12_000 }, path.join(gd, 'out', 'GAP.mp4'));
  // The scan is at 2 s (frame 50); the keyframe before it is frame 30 (1.2 s).
  // 2.8 s from the first piece + 2 s from the second (its start); the hole is skipped.
  check(r.file && Math.abs(r.duration - 4.8) <= 0.5, `${tag}: gap skipped, clip is ~4.8 s (${r.duration})`);
  check(Math.abs(Date.parse(r.start) - (t0 + 1200)) <= 60, `${tag}: reported start is the keyframe before the scan (${r.start})`);
  if (r.file) {
    const first = lumAt(r.file, 0); const last1 = lumAt(r.file, 69); const second = lumAt(r.file, 70);
    check(Math.abs(first - 60) <= 4, `${tag}: clip starts on the keyframe before the scan (frame 30 → brightness ~60, got ${first})`);
    check(Math.abs(last1 - 198) <= 4, `${tag}: first piece kept to its end (brightness ~198, got ${last1})`);
    check(Math.abs(second - 40) <= 4, `${tag}: then the second piece from its start (brightness ~40, got ${second})`);
    const starts = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,start_time', '-of', 'csv=p=0', r.file]).toString().trim().split('\n').map(l => l.split(','));
    const vs = Number(starts.find(x => x[0] === 'video')?.[1]); const as = Number(starts.find(x => x[0] === 'audio')?.[1]);
    // A stream copy keeps a few sound packets from just before the keyframe; a
    // whole keyframe gap of sound with no picture (the old failure) is ~1.2 s here.
    check(Math.abs(vs - as) < 0.5, `${tag}: picture starts with the sound (video ${vs}, audio ${as})`);
    const codec = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', r.file]).toString().trim();
    check(codec === 'h264', `${tag}: saved as H.264, plays everywhere (${codec})`);
    check(fs.readdirSync(path.join(gd, 'out')).length === 1, `${tag}: no work files left beside the clip`);
  }
  // Keyframes are at 0, 1.2, 2.4 s. `frames` counts a clip's pictures (25 per second).
  const frames = f => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f]).toString().trim());
  const cut = (id, w) => cutClip({ data_dir: gd, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }, { id, camera: '9' }, w, path.join(gd, 'out', `${id}.mp4`));
  // A keyframe inside the pre-roll (1.0-1.5 s): start there, nothing added, the end kept.
  const inPre = await cut('k1', { start: t0 + 1000, end: t0 + 3000, scan: t0 + 1500, limit: 2000 });
  if (inPre.file) {
    check(Math.abs(lumAt(inPre.file, 0) - 60) <= 4 && Math.abs(frames(inPre.file) - 45) <= 2, `${tag}: keyframe in the pre-roll: starts there and keeps its end (1.8 s = ~45 frames, got ${frames(inPre.file)})`);
  } else check(false, `${tag}: keyframe in the pre-roll: no clip`);
  // No keyframe in the pre-roll and the window is the whole limit: start on the
  // earlier keyframe (1.2 s) and take the extra off the end, never over the limit.
  const atLimit = await cut('k2', { start: t0 + 2000, end: t0 + 3500, scan: t0 + 2000, limit: 1500 });
  if (atLimit.file) check(Math.abs(frames(atLimit.file) - 38) <= 2 && Math.abs(lumAt(atLimit.file, 0) - 60) <= 4, `${tag}: at the limit the picture never runs over it (1.5 s = ~38 frames, got ${frames(atLimit.file)})`);
  else check(false, `${tag}: at the limit: no clip`);
  // Under the limit: the earlier start is kept and the end is not cut (the
  // moment after the next scan stays in the video).
  const under = await cut('k3', { start: t0 + 2000, end: t0 + 3500, scan: t0 + 2000, limit: 60_000 });
  if (under.file) { const n = frames(under.file); check(Math.abs(n - 58) <= 2 && Math.abs(lumAt(under.file, n - 1) - 172) <= 6, `${tag}: under the limit the end is kept (2.3 s = ~58 frames to brightness ~172, got ${n}, ${lumAt(under.file, n - 1)})`); }
  else check(false, `${tag}: under the limit: no clip`);
}

// ---- the stand-in server ----
const pcFolder = path.join(tmp, 'Packing Videos');   // the PC folder set in Settings → Pack Cam
const settings = { enabled: true, targets: { pc: true, dropbox: true, gdrive: true }, pc_folder: pcFolder, dropbox_folder: '/Packing/Cam', gdrive_folder_name: 'Packing/Cam', max_clip_seconds: 12, pre_roll_seconds: 1, post_roll_seconds: 1, buffer_hours: 6 };
const scans = []; const clips = new Map(); const removedIds = [];
const dbx = new Map(); const drive = new Map(); const driveFolders = []; let lastStatus = null;
const body = req => new Promise(r => { const b = []; req.on('data', c => b.push(c)); req.on('end', () => r(Buffer.concat(b))); });
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(obj == null ? '' : JSON.stringify(obj)); };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const b = await body(req);
  if (u.pathname === '/fn') {
    if (req.headers['x-packcam-agent'] !== KEY) return send(res, 401, { ok: false, error: 'bad key' });
    const d = JSON.parse(b);
    if (d.action === 'agent_poll') {
      lastStatus = d.status;
      const since = d.cursor ? Date.parse(d.cursor) : 0;
      return send(res, 200, { ok: true, now: iso(sNow()), settings, play_secret: SECRET,
        cameras: [{ id: 'c1', number: '1', ip: '127.0.0.1', rtsp_port: 554, rtsp_path: '/x', username: 'admin', password: 'p@ss' }],
        scans: scans.filter(s => Date.parse(s.received_at || s.scanned_at) >= since),
        dropbox: { access_token: 'dbx-token', expires_in: 14000 } });
    }
    if (d.action === 'agent_removed') { removedIds.push(...d.scan_ids); return send(res, 200, { ok: true }); }
    if (d.action === 'agent_report') {
      for (const c of d.clips) clips.set(c.scan_id, c);
      return send(res, 200, { ok: true });
    }
  }
  if (u.pathname === '/dbx-content/files/upload') {
    const a = JSON.parse(req.headers['dropbox-api-arg']);
    if (/FAIL/.test(a.path)) return send(res, 500, { error_summary: 'internal_error/' });
    dbx.set(a.path, b.length);
    return send(res, 200, { path_display: a.path });
  }
  if (u.pathname === '/dbx-api/users/get_space_usage') return send(res, 200, { used: 1.5e9, allocation: { '.tag': 'individual', allocated: 2e9 } });
  if (u.pathname === '/g-api/about') return send(res, 200, { storageQuota: { limit: '100000000000', usage: '1000000000' } });
  if (u.pathname === '/g-token') return send(res, 200, { access_token: 'g-token', expires_in: 3600 });
  if (u.pathname === '/g-api/files' && req.method === 'GET') return send(res, 200, { files: [] });
  if (u.pathname === '/g-api/files' && req.method === 'POST') { driveFolders.push(JSON.parse(b).name); return send(res, 200, { id: 'folder-' + crypto.randomUUID().slice(0, 6) }); }
  if (u.pathname === '/g-upload/files') return send(res, 200, null, { location: `http://127.0.0.1:${server.address().port}/g-upload/session/${crypto.randomUUID()}` });
  if (u.pathname.startsWith('/g-upload/session/')) { const id = 'gf-' + crypto.randomUUID().slice(0, 8); drive.set(id, b.length); return send(res, 200, { id, webViewLink: `https://drive.example/${id}` }); }
  send(res, 404, { error: 'unknown ' + u.pathname });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const P = server.address().port;

// ---- the agent ----
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir);
fs.writeFileSync(path.join(dataDir, 'gdrive.json'), JSON.stringify({ refresh_token: 'r', connected_at: iso(Date.now()) }));
const cfgFile = path.join(tmp, 'config.json');
fs.writeFileSync(cfgFile, JSON.stringify({ server: `http://127.0.0.1:${P}/fn`, agent_key: KEY, data_dir: dataDir, port: AGENT_PORT, ffmpeg: 'ffmpeg', gdrive_client_id: 'id', gdrive_client_secret: 's', poll_ms: 1000, lan_url: `http://127.0.0.1:${AGENT_PORT}` }));
const agent = spawn(process.execPath, [path.join(here, '..', 'packcam.mjs'), cfgFile], {
  env: { ...process.env, PACKCAM_TEST_INPUT_1: video, PACKCAM_SEGMENT_SECONDS: '4',
    PACKCAM_DROPBOX_CONTENT: `http://127.0.0.1:${P}/dbx-content`, PACKCAM_DROPBOX_API: `http://127.0.0.1:${P}/dbx-api`, PACKCAM_NO_NOTEPAD: '1', PACKCAM_REMOVED_CHECK_MS: '2000',
    PACKCAM_GOOGLE_TOKEN: `http://127.0.0.1:${P}/g-token`, PACKCAM_GDRIVE_API: `http://127.0.0.1:${P}/g-api`, PACKCAM_GDRIVE_UPLOAD: `http://127.0.0.1:${P}/g-upload` },
  stdio: ['ignore', 'pipe', 'pipe'] });
let agentLog = '';
agent.stdout.on('data', d => { agentLog += d; }); agent.stderr.on('data', d => { agentLog += d; });
const until = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(500); } check(false, `timed out: ${what}`); return false; };

try {
  await sleep(7000);                                          // some recording first
  const scan = (awb) => { const s = { id: crypto.randomUUID(), awb, courier: 'Delhivery', camera: '1', scanned_at: iso(sNow()) }; scans.push(s); return s; };
  const A = scan('AWB-A'); await sleep(6000);
  const B = scan('AWB-A'); await sleep(5000);                 // the same tracking ID again (another sheet / rescan)
  settings.targets = { pc: false, dropbox: true, gdrive: false };   // C is cut after this: cloud only
  const C = scan('AWB-C');                                    // no next scan: the whole video stops at 12 s
  await until(() => [A, B, C].every(s => ['done', 'failed', 'missing'].includes(clips.get(s.id)?.status)), 60_000, 'three clips finished');

  const a = clips.get(A.id); const b = clips.get(B.id); const c = clips.get(C.id);
  check(a?.status === 'done' && a.pc_path && a.dropbox_path && a.gdrive_file_id, `A saved to PC, Dropbox and Drive (${a?.status} ${a?.error || ''})`);
  check(b?.status === 'done', `B done (${b?.status} ${b?.error || ''})`);
  const day = new Date(Date.parse(A.scanned_at)); const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  check(a?.pc_path === path.join(pcFolder, ymd, 'AWB-A.mp4'), `A named by its tracking ID in the PC folder (${a?.pc_path})`);
  check(a?.dropbox_path === `/Packing/Cam/${ymd}/AWB-A.mp4`, `A in the Dropbox folder (${a?.dropbox_path})`);
  check(driveFolders.slice(0, 3).join('/') === `Packing/Cam/${ymd}`, `Drive folders Packing → Cam → date (${driveFolders.join(', ')})`);
  check(/\/AWB-A_\d{6}\.mp4$/.test(b?.dropbox_path || ''), `same tracking ID again gets the scan time, never overwrites (${b?.dropbox_path})`);
  check(c?.status === 'done' && !c.pc_path && c.dropbox_path && !c.gdrive_file_id, `C saved to Dropbox only (${c?.status} ${c?.error || ''})`);
  // A runs from 1 s before A to 1 s after B: about 8 s.
  check(a && Math.abs(a.duration_s - 8) <= 1.5, `A is ~8 s long (${a?.duration_s})`);
  check(c && Math.abs(c.duration_s - 12) <= 1, `C stops at the 12 s limit for the whole video (~12 s, got ${c?.duration_s})`);
  check(a && Math.abs(Date.parse(a.clip_start) - (Date.parse(A.scanned_at) - 1000)) <= 1500, `A starts at its scan in server time (${a?.clip_start} vs ${A.scanned_at})`);
  if (a?.pc_path) {
    const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', a.pc_path]));
    const v = p.streams.find(s => s.width); const au = p.streams.find(s => !s.width);
    check(v?.codec_name === 'h264' && v.width === 1280 && v.height === 720, `video kept as recorded (${v?.codec_name} ${v?.width}x${v?.height})`);
    check(au?.codec_name === 'aac', `sound converted to AAC (${au?.codec_name})`);
    check(dbx.get(a.dropbox_path) === fs.statSync(a.pc_path).size, 'Dropbox got the whole file');
  }
  check(fs.readdirSync(pcFolder, { recursive: true }).filter(f => /AWB-C/.test(f)).length === 0, 'C left no copy on the PC');

  // Play over the office network: a signed link streams with Range.
  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = crypto.createHmac('sha256', SECRET).update(`${A.id}.${exp}`).digest('hex');
  const r1 = await fetch(`http://127.0.0.1:${AGENT_PORT}/clip/${A.id}?exp=${exp}&sig=${sig}`, { headers: { range: 'bytes=0-99' } });
  check(r1.status === 206 && (await r1.arrayBuffer()).byteLength === 100, `signed link streams a range (${r1.status})`);
  const r2 = await fetch(`http://127.0.0.1:${AGENT_PORT}/clip/${A.id}?exp=${exp}&sig=${'0'.repeat(64)}`);
  check(r2.status === 403, `wrong signature refused (${r2.status})`);
  const r3 = await fetch(`http://127.0.0.1:${AGENT_PORT}/clip/${A.id}?exp=${Math.floor(Date.now() / 1000) - 5}&sig=${crypto.createHmac('sha256', SECRET).update(`${A.id}.${Math.floor(Date.now() / 1000) - 5}`).digest('hex')}`);
  check(r3.status === 403, `expired link refused (${r3.status})`);
  check(lastStatus?.cameras?.[0]?.ok === true && !JSON.stringify(lastStatus).includes('p@ss'), 'heartbeat: camera recording, password never sent back');

  // Clips are cleared by hand: once A's file is removed from the PC, Play says so.
  if (a?.pc_path) fs.unlinkSync(a.pc_path);
  const r4 = await fetch(`http://127.0.0.1:${AGENT_PORT}/clip/${A.id}?exp=${exp}&sig=${sig}`);
  check(r4.status === 404, `clip removed from the PC answers 404 (${r4.status})`);
  check(drive.size === 1, `Drive holds one copy of A, not two (${drive.size})`);
  // A PC folder that cannot be used (here: a file, not a folder) must not lose clips.
  const notAFolder = path.join(tmp, 'not-a-folder'); fs.writeFileSync(notAFolder, 'x');
  Object.assign(settings, { pc_folder: notAFolder, targets: { pc: true, dropbox: false, gdrive: false } });
  await sleep(1500);
  const D = scan('AWB-D'); await sleep(3000); scan('AWB-E');
  await until(() => clips.get(D.id)?.status === 'done', 40_000, 'D finished');
  const dd = clips.get(D.id);
  check(dd?.pc_path?.startsWith(path.join(dataDir, 'clips')) && fs.existsSync(dd.pc_path), `unusable PC folder: clip saved to the agent's own folder (${dd?.pc_path})`);
  await until(() => /cannot be used/.test(lastStatus?.last_error || ''), 10_000, 'folder warning in status');
  check(/cannot be used/.test(lastStatus?.last_error || '') && lastStatus?.pc_folder === path.join(dataDir, 'clips'), `status says so and shows the folder really used (${lastStatus?.pc_folder})`);
  check(!/p@ss/.test(agentLog), 'camera password never written to the log');

  // The key from an older config.json now lives in the data folder's key.txt.
  check(fs.readFileSync(path.join(dataDir, 'key.txt'), 'utf8').includes(KEY), 'agent key moved from config.json to key.txt in the data folder');
  // Free space where clips go, in the heartbeat: Dropbox 0.5 GB free → full.
  await until(() => lastStatus?.storage?.dropbox?.free_gb != null || !lastStatus?.storage?.dropbox, 10_000, 'storage in status');
  const stg = lastStatus?.storage || {};
  check(stg.recording?.level && stg.pc?.level, `storage: recording disk and PC folder reported (${JSON.stringify(stg.pc)})`);
  // A scan a phone sent late (offline): its real scan time is minutes before
  // the agent's cursor, but it was received now — it must still be picked up.
  const late = { id: crypto.randomUUID(), awb: 'AWB-LATE', courier: null, camera: '1', scanned_at: iso(sNow() - 5 * 60_000), received_at: iso(sNow()) };
  scans.push(late);
  await until(() => clips.has(late.id), 15_000, 'late scan picked up');
  check(clips.has(late.id), `a scan sent late keeps its real time and is still picked up (${clips.get(late.id)?.status})`);
  // Two packers on one camera: P1's video runs to P1's own next scan, not
  // to P2's scan in between.
  Object.assign(settings, { targets: { pc: true, dropbox: false, gdrive: false } });
  const scanBy = (awb, user, extra = {}) => { const s = { id: crypto.randomUUID(), awb, courier: null, camera: '1', scanned_at: iso(sNow()), received_at: iso(sNow()), user_id: user, ...extra }; scans.push(s); return s; };
  const p1 = scanBy('AWB-P1A', 'u1'); await sleep(3000);
  scanBy('AWB-P2A', 'u2'); await sleep(3000);
  scanBy('AWB-P1B', 'u1');
  // "+30 s" (here +4 s) with no next scan: the whole video is the limit plus the extra.
  const ext = scanBy('AWB-EXT', 'u3', { extend_seconds: 4 });
  await until(() => clips.get(p1.id)?.status === 'done' && clips.get(ext.id)?.status === 'done', 60_000, 'packer + extend clips');
  check(clips.get(p1.id)?.duration_s >= 6.5, `two packers: P1's video runs to P1's next scan (~8 s, got ${clips.get(p1.id)?.duration_s})`);
  check(Math.abs((clips.get(ext.id)?.duration_s || 0) - 16) <= 1, `"+ time" makes the video longer than the limit (~16 s, got ${clips.get(ext.id)?.duration_s})`);
  // A video moved off the PC by hand is reported, so it stops showing "Saved".
  const p1file = clips.get(p1.id)?.pc_path;
  if (p1file) fs.unlinkSync(p1file);
  await until(() => removedIds.includes(p1.id), 15_000, 'removed video reported');
  check(removedIds.includes(p1.id), 'video deleted from the PC folder is reported to the server');
  // A clip cut at the limit before a late scan (phone offline) arrived is cut
  // again to end at that scan.
  const l1 = scanBy('AWB-L1', 'u5');
  await until(() => clips.get(l1.id)?.status === 'done', 40_000, 'L1 cut at the limit');
  const firstDur = clips.get(l1.id)?.duration_s;
  scanBy('AWB-L2', 'u5', { scanned_at: iso(Date.parse(l1.scanned_at) + 4000) });
  await until(() => clips.get(l1.id)?.status === 'done' && clips.get(l1.id)?.duration_s < 9, 40_000, 'L1 cut again');
  check(firstDur > 11 && clips.get(l1.id)?.duration_s < 9, `late scan inside a cut video: cut again to end there (${firstDur} s → ${clips.get(l1.id)?.duration_s} s)`);

  // Dropbox uploads failing: the status no longer says "Ready".
  Object.assign(settings, { targets: { pc: true, dropbox: true, gdrive: false } });
  const bad = scanBy('AWB-FAIL', 'u4'); await sleep(2000); scanBy('AWB-FAIL2', 'u4');
  await until(() => lastStatus?.dropbox?.ok === false, 40_000, 'dropbox failing in status');
  check(lastStatus?.dropbox?.ok === false && /Uploads failing/.test(lastStatus?.dropbox?.error || ''), `Dropbox uploads failing shows in the status (${JSON.stringify(lastStatus?.dropbox)})`);
  check(!!bad, 'failing upload scan made');

  // "Test connection": a new nonce → each camera asked, a plain answer back.
  Object.assign(settings, { targets: { pc: false, dropbox: true, gdrive: true }, test_nonce: String(sNow()) });
  await until(() => lastStatus?.tests?.['1']?.nonce === settings.test_nonce, 40_000, 'camera test answer');
  const tst = lastStatus?.tests?.['1'];
  check(tst && tst.ok === false && !/rtsp|ffmpeg|DESCRIBE/i.test(tst.message), `test connection: plain answer (${tst?.message})`);
  await until(() => lastStatus?.storage?.dropbox?.level === 'full', 5_000, 'dropbox full');
  check(lastStatus?.storage?.dropbox?.level === 'full' && lastStatus?.storage?.dropbox?.free_gb === 0.5, `Dropbox nearly full shows as full (${JSON.stringify(lastStatus?.storage?.dropbox)})`);
} finally {
  agent.kill('SIGINT');
  await sleep(1500);
  server.close();
  if (failures) console.log('\n--- agent log ---\n' + agentLog.slice(-4000));
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
