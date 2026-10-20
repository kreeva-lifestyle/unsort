// The agent key lives in key.txt in the data folder (C:\PackCam), not in
// config.json next to the program. Replacing the program files with a newer
// version never touches it (it used to: unzipping over the folder replaced
// config.json and the key with it, and the PC just showed "offline").
// A key still in an older config.json is moved into key.txt once.
// With no key yet, key.txt is created with a note, Notepad opens it on
// Windows, and the agent waits until a key is pasted and saved.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { log, sleep } from './util.mjs';

const NOTE = '# Paste the agent key from DailyOffice -> Settings -> Pack Cam -> "Create agent key" on the next line, then save (Ctrl+S) and close Notepad.';
const KEY = /^pcam_[A-Za-z0-9_-]{16,}$/;

/**
 * The key in `file`, or '' (comment lines and stray quotes or spaces are
 * ignored). With more than one key line, the last one — a new key pasted
 * under the old one instead of over it.
 */
export function readKey(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  let key = '';
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().replace(/^["']+|["',]+$/g, '').trim();
    if (t && !t.startsWith('#') && KEY.test(t)) key = t;
  }
  return key;
}

const write = (file, key) => fs.writeFileSync(file, `${NOTE}\r\n${key}${key ? '\r\n' : ''}`);

/** Sets cfg.agent_key, waiting for one to be pasted into key.txt if there is none. */
export async function ensureKey(cfg) {
  const file = cfg.key_file;
  let key = readKey(file);
  if (!key && KEY.test(cfg.legacy_key || '')) {
    key = cfg.legacy_key;
    try { write(file, key); log('agent key moved from config.json to key.txt (updates never touch key.txt)'); }
    catch (e) { log(`could not write key.txt: ${e.message}`); }
  }
  if (key) { cfg.agent_key = key; return; }
  if (!fs.existsSync(file)) { try { write(file, ''); } catch (e) { log(`could not write key.txt: ${e.message}`); } }
  log(`No agent key yet: paste it into ${file} and save. Pack Cam starts by itself once it is there.`);
  if (process.platform === 'win32' && !process.env.PACKCAM_NO_NOTEPAD) {
    try { spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref(); } catch { /* opened by hand then */ }
  }
  while (!(key = readKey(file))) await sleep(3000);
  cfg.agent_key = key;
  log('agent key found — starting');
}
