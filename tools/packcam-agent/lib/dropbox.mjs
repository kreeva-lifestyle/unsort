// Dropbox uploads with the short-lived access token the server hands out on
// each poll (the long-lived Dropbox login stays on the server). Clips up to
// 32 MB go in one request, larger ones in 32 MB pieces, each piece with its
// own timeout. Mode "overwrite": a retry after a lost response replaces the
// same file instead of leaving a second copy (names are unique per scan).
import fs from 'node:fs';

const CONTENT = process.env.PACKCAM_DROPBOX_CONTENT || 'https://content.dropboxapi.com/2';
const CHUNK = 32 * 1024 * 1024;
// The Dropbox-API-Arg header must be plain ASCII.
const arg = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

async function dbx(url, token, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, ...headers }, body, signal: AbortSignal.timeout(5 * 60_000), duplex: 'half' });
  const t = await r.text();
  let d = {}; try { d = t ? JSON.parse(t) : {}; } catch { d = { error_summary: t.slice(0, 200) }; }
  return { status: r.status, d };
}

/** Upload `file` to Dropbox `dest`. Returns the stored path. */
export async function dropboxUpload(token, file, dest) {
  const size = fs.statSync(file).size;
  if (size <= CHUNK) {
    const r = await dbx(`${CONTENT}/files/upload`, token, { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': arg({ path: dest, mode: 'overwrite', mute: true }) }, fs.readFileSync(file));
    if (r.status !== 200) throw new Error(`Dropbox upload ${r.status}: ${r.d.error_summary || 'failed'}`);
    return r.d.path_display || dest;
  }
  // Larger: an upload session — start with the first piece, append the
  // middle ones, finish with the last.
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(CHUNK);
    let off = 0;
    const read = () => buf.subarray(0, fs.readSync(fd, buf, 0, Math.min(CHUNK, size - off), off));
    const send = async (step, a, piece) => {
      const r = await dbx(`${CONTENT}/files/upload_session/${step}`, token, { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': arg(a) }, piece);
      if (r.status !== 200) throw new Error(`Dropbox upload ${r.status}: ${r.d.error_summary || 'failed'}`);
      return r.d;
    };
    let piece = read();
    const session = (await send('start', { close: false }, piece)).session_id;
    off += piece.length;
    while (size - off > CHUNK) {
      piece = read();
      await send('append_v2', { cursor: { session_id: session, offset: off }, close: false }, piece);
      off += piece.length;
    }
    piece = read();
    const done = await send('finish', { cursor: { session_id: session, offset: off }, commit: { path: dest, mode: 'overwrite', mute: true } }, piece);
    return done.path_display || dest;
  } finally { fs.closeSync(fd); }
}
