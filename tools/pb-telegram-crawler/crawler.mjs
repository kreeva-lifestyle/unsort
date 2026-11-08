#!/usr/bin/env node
// Playbook Telegram crawler — runs 24/7 on a small cloud server.
//   node crawler.mjs      (settings come from environment variables; see README)
// Signed in as a staff Telegram account. Every POLL_SECONDS it asks Playbook
// which vendor channel is due (each is checked ONCE A DAY at its own time in
// the overnight window) and forwards that channel's new posts into the admin
// group, where the Playbook bot turns them into products — one channel at a
// time, never all vendors at once. It never posts anything else.
import { makeCrawler } from './lib/cycle.mjs';
import { classify, MSG } from './lib/errors.mjs';
import { makePb } from './lib/pb.mjs';
import { makeTelegram } from './lib/telegram.mjs';
import { log, readEnv, sleep, VERSION } from './lib/util.mjs';

let env;
try {
  env = readEnv();
} catch (e) {
  log(e.message);
  process.exit(1);
}

let tg;
try {
  tg = makeTelegram({ apiId: env.apiId, apiHash: env.apiHash, session: env.session });
} catch {
  log('Setup problem: TG_SESSION is not a valid session string — run "npm run login" and copy it again');
  process.exit(1);
}
const pb = makePb({ url: env.pbUrl, key: env.crawlerKey });
let lastCycle = Date.now();       // last sign of life: a finished cycle, a report or a connect try
const alive = () => { lastCycle = Date.now(); };
const crawler = makeCrawler({ tg, pb, version: VERSION, backfill: env.backfill, forwardGapMs: env.forwardGap * 1000, sleep, log, onReport: alive });

const AUTH_WAIT_MS = 10 * 60_000;
const backoff = n => Math.min(300, 5 * 2 ** Math.min(n, 6)) * 1000;   // 5 s … 5 min
let stopping = false;

// GramJS's own background loops can reject on a dropped line; log it and let
// the next cycle reconnect instead of crashing the process.
process.on('unhandledRejection', e => log(`Background error: ${e?.errorMessage || e?.message || e}`));

// On a redeploy the host stops us: report the cursors first, so the new copy
// does not forward the last few posts again.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    if (stopping) process.exit(1);
    stopping = true;
    log(`Stopping (${sig})`);
    await Promise.race([crawler.report(), sleep(5000)]);
    await Promise.race([tg.disconnect(), sleep(5000)]);
    process.exit(0);
  });
}

// Watchdog: no cycle, report or connect try for 15 minutes means something is
// stuck where no timeout reaches — exit, and the host's restart policy
// ("Always") starts a fresh copy.
const STUCK_MS = 15 * 60_000;
setInterval(() => {
  if (!stopping && Date.now() - lastCycle > STUCK_MS) { log('No progress for 15 min — restarting'); process.exit(1); }
}, 60_000).unref();

// Connects, retrying with backoff; a signed-out session is reported to
// Playbook and retried every 10 minutes (the host would only restart us).
async function connect() {
  for (let n = 0; !stopping; n++) {
    alive();
    try {
      await (n === 0 ? tg.connect() : tg.reconnect());
      log('Connected to Telegram');
      return;
    } catch (e) {
      const c = classify(e);
      if (c.kind === 'auth') {
        log(MSG.auth);
        await crawler.report(MSG.auth);
        await sleep(AUTH_WAIT_MS);
      } else {
        const wait = backoff(n);
        log(`Could not connect to Telegram (${c.code}) — trying again in ${wait / 1000} s`);
        await sleep(wait);
      }
    }
  }
}

log(`Playbook Telegram crawler ${VERSION} starting (asks Playbook every ${env.pollSeconds} s, forwards ${env.forwardGap} s apart${env.backfill ? `, backfill ${env.backfill}` : ''})`);
// Two copies on one session at once can make Telegram end the session for good
// (AUTH_KEY_DUPLICATED). On a redeploy the old copy may still be stopping: wait.
if (env.startDelay) { log(`Waiting ${env.startDelay} s for any older copy to stop`); await sleep(env.startDelay * 1000); }
alive();
await connect();
for (let fails = 0; !stopping;) {
  const started = Date.now();
  alive();
  try {
    await crawler.cycle();
    fails = 0;
  } catch (e) {
    const c = classify(e);
    fails++;
    if (c.kind === 'auth') {
      log(MSG.auth);
      await crawler.report(MSG.auth);
      await sleep(AUTH_WAIT_MS);
      await connect();
      continue;
    }
    if (c.kind === 'network' && !e.pbNetwork) {
      log(`${MSG.network}: ${e.message}`);
      await crawler.report(MSG.network);
      await sleep(backoff(fails - 1));
      await connect();
      continue;
    }
    // Playbook unreachable or refused, or anything unexpected: wait and retry.
    log(`Cycle failed: ${e.message}`);
    if (!e.status && !e.pbNetwork) await crawler.report(`Crawler error: ${String(e.message).slice(0, 160)}`);
    await sleep(backoff(fails - 1));
    continue;
  }
  alive();
  await sleep(env.pollSeconds * 1000 - (Date.now() - started));
}
