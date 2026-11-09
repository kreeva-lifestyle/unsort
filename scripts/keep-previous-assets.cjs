// Deploy step (deploy.yml, after `npm run build`): keep the previous builds'
// hashed chunks in this deploy, so a phone that opened the app before the
// deploy can still load the pages it has not visited yet.
//
// Why: Rollup's content hashes propagate through imports, and the build stamp
// in index-*.js changes every build, so EVERY chunk gets a new name on every
// deploy and the old names 404 the moment the deploy lands. A tab that is
// already open holds the old index.html (GitHub Pages caches it for 10 min),
// so its next lazy page — Playbook, Jobwork, a Minis tool — failed to load
// with "couldn't open / check your connection" on a perfectly good network.
//
// How: the live site serves /assets-manifest.json listing the chunk files of
// its last GENERATIONS builds. This fetches it, downloads every listed file
// that is not in dist/assets, and writes the merged manifest. Nothing here can
// fail the deploy: a missing manifest (first run) or a failed download only
// means that file is not carried. SITE_URL overrides the site for a local test.
const fs = require('node:fs');
const path = require('node:path');

const SITE = (process.env.SITE_URL || 'https://dailyoffice.aryadesigns.co.in').replace(/\/$/, '');
const DIST = path.resolve(__dirname, '..', 'dist');
const ASSETS = path.join(DIST, 'assets');
const MANIFEST = path.join(DIST, 'assets-manifest.json');
const GENERATIONS = 3;       // the current build + the two before it
const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

async function main() {
  if (!fs.existsSync(ASSETS)) throw new Error(`no ${ASSETS}; run the build first`);
  const own = fs.readdirSync(ASSETS).filter(f => fs.statSync(path.join(ASSETS, f)).isFile()).sort();
  const current = { at: new Date().toISOString(), files: own };

  let previous = [];
  try {
    // A fresh cache key per run: the Pages CDN holds the manifest for up to
    // 10 min, so two deploys inside that window read the one before last
    // and dropped the just-deployed build's chunks (`cache` only governs the
    // runner's own fetch cache, not the edge).
    const r = await fetch(`${SITE}/assets-manifest.json?r=${process.env.GITHUB_RUN_ID || Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.ok) {
      const m = await r.json();
      if (Array.isArray(m?.generations)) previous = m.generations.filter(g => g && Array.isArray(g.files));
      if (previous[0]?.at) console.log(`previous manifest: latest generation built ${previous[0].at}`);
    } else console.log(`previous manifest: HTTP ${r.status} (first deploy with this step?) — nothing carried`);
  } catch (e) { console.log(`previous manifest unreachable (${e.message}) — nothing carried`); }

  const kept = previous.slice(0, GENERATIONS - 1);
  const have = new Set(own);
  const wanted = [...new Set(kept.flatMap(g => g.files))].filter(f => /^[\w.-]+$/.test(f) && !have.has(f));
  const failed = new Set();
  let i = 0;
  const worker = async () => {
    while (i < wanted.length) {
      const f = wanted[i++];
      try {
        const r = await fetch(`${SITE}/assets/${f}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(path.join(ASSETS, f), Buffer.from(await r.arrayBuffer()));
      } catch (e) { failed.add(f); console.log(`  not carried: ${f} (${e.message})`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const generations = [current, ...kept.map(g => ({ at: g.at, files: g.files.filter(f => !failed.has(f) && (have.has(f) || wanted.includes(f))) }))];
  fs.writeFileSync(MANIFEST, JSON.stringify({ generations }, null, 1));
  console.log(`assets: ${own.length} built, ${wanted.length - failed.size} carried from ${kept.length} previous build(s), ${failed.size} failed`);
}

main().catch(e => { console.log(`keep-previous-assets skipped: ${e.message}`); });
