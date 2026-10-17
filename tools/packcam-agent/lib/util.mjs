// Small shared helpers: config, logging, JSON state files, paths, formatting.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// One version for the agent and the app's "update the PC" notice: package.json.
export const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const SEGMENT_SECONDS = Number(process.env.PACKCAM_SEGMENT_SECONDS) || 60;   // env: tests only

export function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = {
    server: String(raw.server || '').trim(),
    agent_key: String(raw.agent_key || '').trim(),
    data_dir: path.resolve(String(raw.data_dir || './packcam-data')),
    port: Number(raw.port) || 8765,
    ffmpeg: String(raw.ffmpeg || 'ffmpeg'),
    gdrive_client_id: String(raw.gdrive_client_id || ''),
    gdrive_client_secret: String(raw.gdrive_client_secret || ''),
    poll_ms: Number(raw.poll_ms) || 5000,
    // Optional: the PC's address as the phones/laptops see it, when the PC has
    // more than one network card (e.g. "http://192.168.1.20:8765").
    lan_url: String(raw.lan_url || '').trim(),
  };
  if (!/^https?:\/\//.test(cfg.server)) throw new Error('config.json: "server" must be the packcam function URL');
  if (cfg.agent_key.length < 20) throw new Error('config.json: paste the agent key from Settings → Pack Cam into "agent_key"');
  // ffprobe sits next to ffmpeg (same folder, same naming).
  cfg.ffprobe = raw.ffprobe ? String(raw.ffprobe) : cfg.ffmpeg.replace(/ffmpeg(\.exe)?$/i, (_m, exe) => `ffprobe${exe || ''}`);
  for (const d of ['segments', 'clips', 'tmp', 'logs']) fs.mkdirSync(path.join(cfg.data_dir, d), { recursive: true });
  return cfg;
}

let logFile = null;
export function initLog(dataDir) { logFile = path.join(dataDir, 'logs', 'packcam.log'); }
export function log(...a) {
  const line = `${new Date().toISOString()} ${a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`;
  console.log(line);
  if (!logFile) return;
  try {
    // Keep the log small: roll over at 5 MB, keep one old file.
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5_000_000) fs.renameSync(logFile, logFile + '.1');
    fs.appendFileSync(logFile, line + '\n');
  } catch { /* logging must never stop the agent */ }
}

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);   // atomic on the same disk: a crash never leaves half a file
}

export const pad = n => String(n).padStart(2, '0');
/** Local date "2026-10-17" and time "143005" — clip folders and file names. */
export const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = d => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
/** An AWB as a safe file-name part. */
export const safeName = s => String(s).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'scan';

export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}

export function diskInfo(dir) {
  try {
    const s = fs.statfsSync(dir);
    return { free_gb: +(s.bavail * s.bsize / 1e9).toFixed(1), total_gb: +(s.blocks * s.bsize / 1e9).toFixed(1) };
  } catch { return { free_gb: null, total_gb: null }; }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
