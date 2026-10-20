// "Test connection" (Settings → Pack Cam → Cameras): the app sets a new
// test_nonce in the settings; on the next poll the agent asks each camera for
// its stream with ffprobe (10 s) and reports the answer in the heartbeat as
// tests[number] = { nonce, ok, message }. It also lets a camera that was
// stopped for a wrong password try again.
import { execFile } from 'node:child_process';
import { rtspUrl } from './recorder.mjs';
import { plainCameraError } from './cameraerrors.mjs';
import { log } from './util.mjs';

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

/** The answers (tests) and run(): what packcam.mjs calls on every poll. */
export function makeTester(cfg, recorderOf) {
  // "Test connection" answers, camera number → { nonce, ok, message }.
  const tests = {}; let testNonce = null;
  /**
   * Settings → Pack Cam → Cameras → "Test connection" sets a new test_nonce:
   * ask every camera once; one stopped for a wrong password records again once
   * it answers (e.g. the password was changed on the camera to match).
   * After a start, a press more than 2 minutes old is only noted.
   */
  async function run(nonce, cameras, serverNow) {
    if (!nonce || nonce === testNonce) return;
    const first = testNonce === null; testNonce = nonce;
    // The nonce is the press time (ms): one pressed while the PC was starting still counts.
    if (first && !(Math.abs(Date.parse(serverNow) - Number(nonce)) < 120_000)) return;
    log('testing the camera connections');
    // All at once: an unreachable camera takes ~10 s, and the app is waiting.
    await Promise.all(cameras.map(async c => {
      const r = await testCamera(cfg, c);
      if (nonce !== testNonce) return;   // a newer press is running
      tests[c.number] = { nonce, ok: r.ok, message: r.message, at: new Date().toISOString() };
      log(`camera ${c.number} test: ${r.message}`);
      // Only a camera that answered goes back to recording: one stopped for a
      // wrong password stays stopped (each failed login brings the camera's
      // lock-out nearer); a new password in the app starts it afresh anyway.
      if (r.ok) recorderOf(c.number)?.retry();
    }));
  }

  return { tests, run };
}
