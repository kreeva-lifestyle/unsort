// Small helpers shared by the crawler and the login script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

// Logs go to stdout only (the cloud host keeps them). Never pass the
// session string, the crawler key or a bot token in here.
export function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

export const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));

// Reads and checks the environment. Throws one plain message listing every
// missing or wrong variable, so a deploy that is set up wrong says so at once.
export function readEnv(env = process.env) {
  const problems = [];
  const need = name => {
    const v = (env[name] || '').trim();
    if (!v) problems.push(`${name} is not set`);
    return v;
  };
  const apiId = Number(need('TG_API_ID'));
  if (env.TG_API_ID && !(Number.isInteger(apiId) && apiId > 0)) problems.push('TG_API_ID must be a number');
  const cfg = {
    apiId,
    apiHash: need('TG_API_HASH'),
    session: need('TG_SESSION'),
    pbUrl: need('PB_URL'),
    crawlerKey: need('PB_CRAWLER_KEY'),
    pollSeconds: num(env.POLL_SECONDS, 60, 15, 3600, 'POLL_SECONDS', problems),
    backfill: num(env.BACKFILL_POSTS, 0, 0, 500, 'BACKFILL_POSTS', problems),
    startDelay: num(env.START_DELAY_SECONDS, 20, 0, 600, 'START_DELAY_SECONDS', problems),
    forwardGap: gap(env.FORWARD_GAP_SECONDS, problems),
  };
  if (cfg.pbUrl && !/^https:\/\//.test(cfg.pbUrl)) problems.push('PB_URL must start with https://');
  if (problems.length) throw new Error(`Setup problem: ${problems.join('; ')}`);
  return cfg;
}

function num(raw, dflt, min, max, name, problems) {
  if (raw == null || String(raw).trim() === '') return dflt;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    problems.push(`${name} must be a whole number from ${min} to ${max}`);
    return dflt;
  }
  return n;
}

// Seconds between two forwards (all channels): default 1.5, at least 1 (Telegram's limits), at most 60.
function gap(raw, problems) {
  if (raw == null || String(raw).trim() === '') return 1.5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 60) {
    problems.push('FORWARD_GAP_SECONDS must be a number from 1 to 60');
    return 1.5;
  }
  return n;
}
