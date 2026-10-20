// "Test connection" (Settings → Pack Cam → Cameras): the app sets a new
// test_nonce in the settings; on the next poll the agent asks each camera for
// its stream with ffprobe (10 s) and reports the answer in the heartbeat as
// tests[number] = { nonce, ok, message }. It also lets a camera that was
// stopped for a wrong password try again.
import { execFile } from 'node:child_process';
import { rtspUrl } from './recorder.mjs';
import { plainCameraError } from './cameraerrors.mjs';

export function testCamera(cfg, cam) {
  return new Promise(resolve => {
    const args = ['-v', 'error', '-rtsp_transport', 'tcp', '-timeout', '10000000', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height', '-of', 'json', rtspUrl(cam)];
    execFile(cfg.ffprobe, args, { timeout: 25_000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const raw = (String(stderr).trim().split('\n').pop() || err.message).replace(/rtsp:\/\/[^@\s]*@/g, 'rtsp://***@');
        return resolve({ ok: false, message: plainCameraError(err.code === 'ENOENT' ? 'ENOENT' : err.killed ? 'timed out' : raw, cam) });
      }
      let v = null;
      try { v = JSON.parse(stdout).streams?.[0] || null; } catch { /* below */ }
      if (!v) return resolve({ ok: false, message: 'The camera answered but sent no video' });
      const codec = v.codec_name === 'hevc' ? 'H.265 (converted to H.264 for each video)' : v.codec_name === 'h264' ? 'H.264' : String(v.codec_name || '').toUpperCase();
      resolve({ ok: true, message: `Connected — ${codec}${v.width ? `, ${v.width}×${v.height}` : ''}` });
    });
  });
}
