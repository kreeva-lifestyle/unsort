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

// ---- the stand-in server ----
const settings = { enabled: true, targets: { pc: true, dropbox: true, gdrive: true }, dropbox_folder: '/PackCam', gdrive_folder_name: 'PackCam', max_clip_seconds: 12, pre_roll_seconds: 1, post_roll_seconds: 1, buffer_hours: 6, auto_delete_days: 0 };
const scans = []; const clips = new Map(); const deleteQueue = []; const deletedIds = [];
const dbx = new Map(); const drive = new Map(); let lastStatus = null;
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
        scans: scans.filter(s => Date.parse(s.scanned_at) >= since), deletes: deleteQueue.splice(0),
        dropbox: { access_token: 'dbx-token', expires_in: 14000 } });
    }
    if (d.action === 'agent_report') {
      for (const c of d.clips) clips.set(c.scan_id, c);
      deletedIds.push(...d.deleted);
      return send(res, 200, { ok: true });
    }
  }
  if (u.pathname === '/dbx-content/files/upload') {
    const a = JSON.parse(req.headers['dropbox-api-arg']);
    dbx.set(a.path, b.length);
    return send(res, 200, { path_display: a.path });
  }
  if (u.pathname === '/dbx-api/files/delete_v2') { const p = JSON.parse(b).path; return dbx.delete(p) ? send(res, 200, {}) : send(res, 409, { error_summary: 'path_lookup/not_found/' }); }
  if (u.pathname === '/g-token') return send(res, 200, { access_token: 'g-token', expires_in: 3600 });
  if (u.pathname === '/g-api/files' && req.method === 'GET') return send(res, 200, { files: [] });
  if (u.pathname === '/g-api/files' && req.method === 'POST') return send(res, 200, { id: 'folder-' + crypto.randomUUID().slice(0, 6) });
  if (u.pathname === '/g-upload/files') return send(res, 200, null, { location: `http://127.0.0.1:${server.address().port}/g-upload/session/${crypto.randomUUID()}` });
  if (u.pathname.startsWith('/g-upload/session/')) { const id = 'gf-' + crypto.randomUUID().slice(0, 8); drive.set(id, b.length); return send(res, 200, { id, webViewLink: `https://drive.example/${id}` }); }
  if (u.pathname.startsWith('/g-api/files/') && req.method === 'DELETE') { drive.delete(u.pathname.split('/').pop()); return send(res, 204, null); }
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
    PACKCAM_DROPBOX_CONTENT: `http://127.0.0.1:${P}/dbx-content`, PACKCAM_DROPBOX_API: `http://127.0.0.1:${P}/dbx-api`,
    PACKCAM_GOOGLE_TOKEN: `http://127.0.0.1:${P}/g-token`, PACKCAM_GDRIVE_API: `http://127.0.0.1:${P}/g-api`, PACKCAM_GDRIVE_UPLOAD: `http://127.0.0.1:${P}/g-upload` },
  stdio: ['ignore', 'pipe', 'pipe'] });
let agentLog = '';
agent.stdout.on('data', d => { agentLog += d; }); agent.stderr.on('data', d => { agentLog += d; });
const until = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(500); } check(false, `timed out: ${what}`); return false; };

try {
  await sleep(7000);                                          // some recording first
  const scan = (awb) => { const s = { id: crypto.randomUUID(), awb, courier: 'Delhivery', camera: '1', scanned_at: iso(sNow()) }; scans.push(s); return s; };
  const A = scan('AWB-A'); await sleep(6000);
  const B = scan('AWB-B'); await sleep(5000);
  settings.targets = { pc: false, dropbox: true, gdrive: false };   // C is cut after this: cloud only
  const C = scan('AWB-C');                                    // no next scan: capped at 12 s
  await until(() => [A, B, C].every(s => ['done', 'failed', 'missing'].includes(clips.get(s.id)?.status)), 60_000, 'three clips finished');

  const a = clips.get(A.id); const b = clips.get(B.id); const c = clips.get(C.id);
  check(a?.status === 'done' && a.pc_path && a.dropbox_path && a.gdrive_file_id, `A saved to PC, Dropbox and Drive (${a?.status} ${a?.error || ''})`);
  check(b?.status === 'done', `B done (${b?.status} ${b?.error || ''})`);
  check(c?.status === 'done' && !c.pc_path && c.dropbox_path && !c.gdrive_file_id, `C saved to Dropbox only (${c?.status} ${c?.error || ''})`);
  // A runs from 1 s before A to 1 s after B: about 8 s.
  check(a && Math.abs(a.duration_s - 8) <= 1.5, `A is ~8 s long (${a?.duration_s})`);
  check(c && Math.abs(c.duration_s - 14) <= 1.5, `C stops at the 12 s cap + rolls (~14 s, got ${c?.duration_s})`);
  check(a && Math.abs(Date.parse(a.clip_start) - (Date.parse(A.scanned_at) - 1000)) <= 1500, `A starts at its scan in server time (${a?.clip_start} vs ${A.scanned_at})`);
  if (a?.pc_path) {
    const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', a.pc_path]));
    const v = p.streams.find(s => s.width); const au = p.streams.find(s => !s.width);
    check(v?.codec_name === 'h264' && v.width === 1280 && v.height === 720, `video kept as recorded (${v?.codec_name} ${v?.width}x${v?.height})`);
    check(au?.codec_name === 'aac', `sound converted to AAC (${au?.codec_name})`);
    check(dbx.get(a.dropbox_path) === fs.statSync(a.pc_path).size, 'Dropbox got the whole file');
  }
  check(fs.readdirSync(path.join(dataDir, 'clips'), { recursive: true }).filter(f => /AWB-C/.test(f)).length === 0, 'C left no copy on the PC');

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

  // Bulk delete: A (all three copies) and C (Dropbox only).
  const idA = crypto.randomUUID(); const idC = crypto.randomUUID();
  deleteQueue.push({ id: idA, scan_id: A.id, pc_path: a?.pc_path, dropbox_path: a?.dropbox_path, gdrive_file_id: a?.gdrive_file_id },
    { id: idC, scan_id: C.id, pc_path: null, dropbox_path: c?.dropbox_path, gdrive_file_id: null });
  await until(() => deletedIds.includes(idA) && deletedIds.includes(idC), 15_000, 'deletes reported');
  check(a?.pc_path && !fs.existsSync(a.pc_path), 'A removed from the PC');
  check(!dbx.has(a?.dropbox_path) && !dbx.has(c?.dropbox_path), 'A and C removed from Dropbox');
  check(!drive.has(a?.gdrive_file_id), 'A removed from Drive');
  const r4 = await fetch(`http://127.0.0.1:${AGENT_PORT}/clip/${A.id}?exp=${exp}&sig=${sig}`);
  check(r4.status === 404, `deleted clip no longer plays (${r4.status})`);
  check(!/p@ss/.test(agentLog), 'camera password never written to the log');
} finally {
  agent.kill('SIGINT');
  await sleep(1500);
  server.close();
  if (failures) console.log('\n--- agent log ---\n' + agentLog.slice(-4000));
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
