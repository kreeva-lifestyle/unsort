// One ffmpeg per camera: RTSP over TCP → one-minute MPEG-TS pieces. The
// video is a stream copy (the recording is never re-encoded; clips from an H.265 camera are converted when cut, see clipper.mjs); only
// the audio becomes AAC, because the cameras' G.711 audio cannot go into
// MPEG-TS or MP4 (cheap — a few % of one CPU core). MPEG-TS survives a
// crash or power cut mid-file. ffmpeg is restarted when it exits (camera
// rebooted, network blip) with a growing pause, and when the camera's
// settings change.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cameraDir, listSegments } from './segments.mjs';
import { log, SEGMENT_SECONDS } from './util.mjs';

export function rtspUrl(c) {
  const auth = c.username ? `${encodeURIComponent(c.username)}${c.password ? ':' + encodeURIComponent(c.password) : ''}@` : '';
  const p = String(c.rtsp_path || '/Streaming/Channels/101');
  return `rtsp://${auth}${c.ip}:${Number(c.rtsp_port) || 554}${p.startsWith('/') ? p : '/' + p}`;
}
/** The camera URL with the password hidden, for logs and the status page. */
export const maskedUrl = c => rtspUrl({ ...c, password: c.password ? '***' : '' });

/**
 * Stop recorders left behind by an earlier copy of the agent: on Windows,
 * ffmpeg outlives a node that crashed or was killed, and the next start would
 * then record every camera twice into the same folder. Finds ffmpeg processes
 * writing into this data folder's segments. Call only once this is the only
 * agent on the PC (after the web port is ours). Resolves to the count.
 */
export function stopOrphanRecorders(cfg) {
  if (process.platform !== 'win32') return Promise.resolve(0);
  // The folder goes in through the environment and is escaped by PowerShell
  // itself: no quoting of the path into the script.
  const script = "$m = [WildcardPattern]::Escape($env:PACKCAM_SEGMENTS); $n = 0; Get-CimInstance Win32_Process -Filter \"Name='ffmpeg.exe'\" | Where-Object { [string]$_.CommandLine -like \"*$m*\" } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $n++ } catch { Write-Output ('not stopped: ' + $_.Exception.Message) } }; $n";
  return new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 60_000, env: { ...process.env, PACKCAM_SEGMENTS: path.join(cfg.data_dir, 'segments') } }, (e, out) => {
        const lines = String(out || '').trim().split(/\r?\n/);
        const n = Number(lines[lines.length - 1]) || 0;
        for (const l of lines) if (l.startsWith('not stopped')) log(`old recorder ${l}`);
        if (e) log(`old recorders check: ${e.message.split('\n')[0]}`);
        else if (n) log(`stopped ${n} recorder(s) left from an earlier run`);
        resolve(n);
      });
  });
}

export class Recorder {
  constructor(cfg, cam) {
    this.cfg = cfg; this.cam = cam; this.key = JSON.stringify(cam);
    this.dir = cameraDir(cfg.data_dir, cam.number);
    this.proc = null; this.stopped = false; this.backoff = 5000; this.lastError = ''; this.startedAt = 0;
    this.start();
  }
  input() {
    // Test hook: PACKCAM_TEST_INPUT_<number> plays a local file as if it were the camera.
    const test = process.env[`PACKCAM_TEST_INPUT_${this.cam.number}`];
    if (test) return ['-re', '-stream_loop', '-1', '-i', test];
    return ['-rtsp_transport', 'tcp', '-timeout', '15000000', '-i', rtspUrl(this.cam)];
  }
  start() {
    if (this.stopped) return;
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', ...this.input(),
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k',
      '-f', 'segment', '-segment_time', String(SEGMENT_SECONDS), '-segment_format', 'mpegts',
      '-reset_timestamps', '1', '-strftime', '1', path.join(this.dir, '%Y%m%d-%H%M%S.ts')];
    this.startedAt = Date.now();
    const p = spawn(this.cfg.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    this.proc = p;
    let err = '';
    p.stderr.on('data', b => { err = (err + b.toString()).slice(-600); });
    p.on('error', e => { this.lastError = `ffmpeg could not start: ${e.message}`; });
    p.on('exit', code => {
      if (this.proc !== p) return;
      this.proc = null;
      if (this.stopped) return;
      const msg = (err.trim().split('\n').pop() || `ffmpeg exited (${code})`).replace(/rtsp:\/\/[^@\s]*@/g, 'rtsp://***@');
      this.lastError = msg;
      // A run that lasted a while was healthy: start over with a short pause.
      if (Date.now() - this.startedAt > 120_000) this.backoff = 5000;
      log(`camera ${this.cam.number}: ${msg} — restarting in ${this.backoff / 1000}s`);
      setTimeout(() => this.start(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 60_000);
    });
    log(`camera ${this.cam.number}: recording ${process.env[`PACKCAM_TEST_INPUT_${this.cam.number}`] ? '(test input)' : maskedUrl(this.cam)}`);
  }
  stop() {
    this.stopped = true;
    if (this.proc) { try { this.proc.kill('SIGINT'); } catch { /* gone */ } }
  }
  status() {
    const segs = listSegments(this.dir);
    const last = segs.length ? segs[segs.length - 1] : null;
    let lastWrite = 0;
    if (last) { try { lastWrite = fs.statSync(last.file).mtimeMs; } catch { /* gone */ } }
    const ok = !!this.proc && Date.now() - lastWrite < 90_000;
    return { number: this.cam.number, ok, last_segment_at: lastWrite ? new Date(lastWrite).toISOString() : null, error: ok ? null : (this.lastError || (this.proc ? 'No video received yet' : 'Not running')) };
  }
}
