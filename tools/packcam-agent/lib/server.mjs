// The agent's small web server on the office PC.
//   /clip/<scan id>?exp=&sig=  — streams a PC-stored clip to anyone on the
//       office network holding a link signed by the server (Play in the app).
//       Range requests work, so the video can be scrubbed.
//   /, /gdrive/connect, /gdrive/callback — the PC's own status page and the
//       one-time Google Drive sign-in; answered on the PC itself only.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream';
import { log } from './util.mjs';

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Is `sig` the server's signature of `<id>.<exp>`, and not expired? */
export function validSig(secret, id, exp, sig) {
  if (!secret || !/^\d{9,12}$/.test(String(exp)) || !/^[0-9a-f]{64}$/.test(String(sig))) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const want = crypto.createHmac('sha256', secret).update(`${id}.${exp}`).digest();
  return crypto.timingSafeEqual(want, Buffer.from(sig, 'hex'));
}

// pipeline() closes the file when the viewer stops or skips (no leaked
// handles) and keeps a read error from crashing the agent.
const streamed = e => { if (e && e.code !== 'ERR_STREAM_PREMATURE_CLOSE') log(`clip stream: ${e.message}`); };

function sendFile(req, res, file) {
  let size;
  try { size = fs.statSync(file).size; } catch { res.writeHead(404); return res.end('This video is no longer on the PC'); }
  const head = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return pipeline(fs.createReadStream(file, { start, end }), res, streamed);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  pipeline(fs.createReadStream(file), res, streamed);
}

function statusPage(st, drive) {
  const d = drive.status();
  const cams = (st.cameras || []).map(c => `<tr><td>Camera ${esc(c.number)}</td><td style="color:${c.ok ? '#16a34a' : '#dc2626'}">${c.ok ? 'Recording' : esc(c.error)}</td><td>${esc(c.last_segment_at ? new Date(c.last_segment_at).toLocaleString('en-IN') : '—')}</td></tr>`).join('') || '<tr><td colspan="3">No cameras yet — add the camera IP addresses in DailyOffice → Settings → Pack Cam.</td></tr>';
  const gd = !d.configured ? 'Not set up (add the Google client id/secret to config.json to use Drive)'
    : d.connected ? `Connected ${esc(d.connected_at)} · <a href="/gdrive/connect">Connect again</a>` : '<a href="/gdrive/connect"><b>Connect Google Drive</b></a>';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pack Cam</title>
<meta http-equiv="refresh" content="15"><style>body{font:14px system-ui;margin:24px;max-width:760px}td,th{padding:6px 10px;border-bottom:1px solid #ddd;text-align:left}</style>
<h2>Pack Cam agent ${esc(st.version)}</h2>
<p>Server: ${st.server_ok ? 'connected' : `<b style="color:#dc2626">${esc(st.last_error || 'not reached yet')}</b>`} · Recording ${st.enabled ? 'on' : 'off (turn it on in Settings → Pack Cam)'}</p>
<p>Disk: ${esc(st.disk?.free_gb)} GB free · buffer ${esc(st.buffer_gb)} GB · Clips waiting ${esc(st.queue?.waiting)} · failed ${esc(st.queue?.failed)}</p>
<table><tr><th>Camera</th><th>State</th><th>Last video</th></tr>${cams}</table>
<p>Google Drive: ${gd}</p><p>Address for the app: ${esc(st.lan_url)}</p>`;
}

/** ctx: { secret(), clipFile(scanId), status(), drive } */
export function startServer(cfg, ctx) {
  let pendingState = null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const clip = /^\/clip\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (clip && (req.method === 'GET' || req.method === 'HEAD')) {
        if (!validSig(ctx.secret(), clip[1], url.searchParams.get('exp'), url.searchParams.get('sig'))) { res.writeHead(403); return res.end('This link has expired — press Play in DailyOffice again'); }
        const file = ctx.clipFile(clip[1]);
        if (!file) { res.writeHead(404); return res.end('This video is not on the PC'); }
        return sendFile(req, res, file);
      }
      if (!LOCAL.has(req.socket.remoteAddress)) { res.writeHead(404); return res.end(); }
      if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(statusPage(ctx.status(), ctx.drive)); }
      if (url.pathname === '/gdrive/connect') {
        if (!ctx.drive.configured()) { res.writeHead(400); return res.end('Add gdrive_client_id and gdrive_client_secret to config.json first, then restart Pack Cam.'); }
        pendingState = crypto.randomBytes(16).toString('hex');
        res.writeHead(302, { location: ctx.drive.authUrl(pendingState) });
        return res.end();
      }
      if (url.pathname === '/gdrive/callback') {
        const ok = pendingState && url.searchParams.get('state') === pendingState && url.searchParams.get('code');
        if (!ok) { res.writeHead(400); return res.end(`Google sign-in did not finish${url.searchParams.get('error') ? ': ' + url.searchParams.get('error') : ''}. Go back and try again.`); }
        pendingState = null;
        await ctx.drive.finishConnect(url.searchParams.get('code'));
        log('Google Drive connected');
        res.writeHead(302, { location: '/' });
        return res.end();
      }
      res.writeHead(404); res.end();
    } catch (e) {
      log(`web: ${e.message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end(String(e.message).slice(0, 300));
    }
  });
  server.on('error', e => log(`web server: ${e.message} (port ${cfg.port})`));
  server.listen(cfg.port, '0.0.0.0', () => log(`web: http://localhost:${cfg.port}`));
  return server;
}
