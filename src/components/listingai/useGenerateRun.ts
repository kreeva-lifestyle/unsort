// Generation state + loop for Listing AI, extracted from ListingAI.tsx for
// the file budget. Owns results state, chunked edge calls (cache checkup id
// threading, cost accumulation) and SAVES each successful run to
// listing_runs so it survives reloads (5-day retention, pg_cron purge).
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { call, GenRow, GenUsage } from './api';
import { SkuLine } from './skuInput';
import { runValidate, splitIssues, PreflightIssues } from './preflight';
import type { ListingTemplate, ListingRun } from '../../types/database';

const CHUNK = 3;     // SKUs per edge call (server caps at 5) — keeps each call fast
export const RUN_CAP = 200; // SKUs per run — still a hard bill ceiling per tap, sized for real batches
// Chunks used to run strictly one-after-another, so a 60-SKU run was ~20
// sequential AI calls (~40-60 min). The AI writing time per chunk is
// irreducible, but chunks are independent — run a few at once instead.
const WORKERS = 3;   // concurrent chunks after the cache-warming first chunk

// What ResultsTable/export need to know about the run's template. Falls back
// to a bare ref (plain-sheet export) when the template was deleted.
export type RunTpl = Pick<ListingTemplate, 'id' | 'name' | 'file_name' | 'sheet_name' | 'header_row'>;

export function useGenerateRun(addToast: (m: string, t?: string) => void) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [headers, setHeaders] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [rows, setRows] = useState<GenRow[]>([]);
  const [usage, setUsage] = useState<GenUsage | null>(null);
  const [cost, setCost] = useState({ usd: 0, saved: 0 });
  const [runTpl, setRunTpl] = useState<RunTpl | null>(null);
  const [savedCount, setSavedCount] = useState(0); // bumps RunHistory reload

  // A 200-SKU run takes a while and only saves at the end — warn before a
  // stray tab close throws the whole spend away.
  useEffect(() => {
    if (!generating) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [generating]);

  // Reopen a saved run (Recent runs list) — same states the live run uses.
  const loadRun = (run: ListingRun, tpl: RunTpl) => {
    setHeaders(run.headers || []);
    setKinds(run.kinds || []);
    setRows((run.rows || []) as GenRow[]);
    setUsage((run.usage as GenUsage) || null);
    setCost({ usd: Number(run.est_usd || 0), saved: 0 });
    setRunTpl(tpl);
  };

  // Pre-AI preflight state: issues found by the free validate call, plus what
  // we need to continue after the owner's choice.
  const [preflight, setPreflight] = useState<{ tpl: ListingTemplate; skus: SkuLine[]; isAdmin: boolean; issues: PreflightIssues } | null>(null);

  // Free pre-check BEFORE any AI spend: one edge call flags SKUs missing from
  // the master sheet or looking like a different garment category than the
  // template. Issues pause here (the panel decides); a clean list runs with no
  // extra tap. Fail-open on pre-check errors — the edge generate path has the
  // same category guard server-side, so a broken preflight still can't burn
  // tokens on mismatched SKUs.
  const generate = async (selected: ListingTemplate, allSkus: SkuLine[], isAdmin: boolean) => {
    if (generating) return;
    let skus = allSkus;
    if (skus.length > RUN_CAP) { addToast(`Capped to the first ${RUN_CAP} SKUs (of ${skus.length}) — run again for the rest`, 'error'); skus = skus.slice(0, RUN_CAP); }
    setPreflight(null);
    let issues: PreflightIssues | null = null;
    try {
      setGenerating(true); // covers the validate round-trip so Generate can't double-fire
      issues = splitIssues(await runValidate(skus, selected.id), skus);
    } catch { addToast("Couldn't pre-check the SKUs — continuing without the check", 'error'); }
    finally { setGenerating(false); }
    if (issues && (issues.notInMaster.length > 0 || issues.mismatched.length > 0)) {
      setPreflight({ tpl: selected, skus, isAdmin, issues });
      return;
    }
    await run(selected, skus, isAdmin, false);
  };

  // The owner's choice on the preflight panel. 'clean' drops the flagged SKUs;
  // 'force' runs everything with the server-side guard disabled (force:true).
  const confirmPreflight = async (mode: 'clean' | 'force' | 'cancel') => {
    const p = preflight;
    setPreflight(null);
    if (!p || mode === 'cancel') return;
    if (mode === 'force') { await run(p.tpl, p.skus, p.isAdmin, true); return; }
    if (p.issues.clean.length === 0) { addToast('No valid SKUs left to run', 'error'); return; }
    await run(p.tpl, p.issues.clean, p.isAdmin, false);
  };

  const run = async (selected: ListingTemplate, skus: SkuLine[], isAdmin: boolean, force: boolean) => {
    if (generating) return;
    setGenerating(true);
    setRows([]); setHeaders([]); setKinds([]); setUsage(null); setCost({ usd: 0, saved: 0 });
    setRunTpl(selected);
    setProgress({ done: 0, total: skus.length });
    const chunks: SkuLine[][] = [];
    for (let i = 0; i < skus.length; i += CHUNK) chunks.push(skus.slice(i, i + CHUNK));
    // Chunks finish out of order — slots keyed by chunk index keep the rows in
    // paste order no matter which worker lands first.
    const slots: (GenRow[] | null)[] = new Array(chunks.length).fill(null);
    const tot: GenUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let lastHeaders: string[] = [], lastKinds: string[] = [], model = '';
    let cacheWarned = false;
    let usd = 0, saved = 0;
    let doneSkus = 0;
    const failedSkus: string[] = []; // chunks that errored (after one retry) — the rest of the run continues
    let fatal = '';                  // config-level error (bad key, no access) — pointless to keep going
    let failToasts = 0;              // cap error toasts so a dying run doesn't bury the screen

    // One chunk end-to-end. Retries once after 30s on a rate-limit answer;
    // state merges are safe unlocked because JS is single-threaded.
    const runChunk = async (idx: number, prevId: string | null): Promise<string> => {
      const chunk = chunks[idx];
      const attempt = () => call({ action: 'generate', items: chunk, templateId: selected.id, prevMessageId: prevId, force });
      let { status: st, data } = await attempt();
      if (!data?.ok && (st === 429 || /rate limit/i.test(String(data?.error || '')))) {
        await new Promise(res => setTimeout(res, 30_000));
        ({ status: st, data } = await attempt());
      }
      if (!data?.ok) {
        const msg = data?.error === 'no_api_key'
          ? (isAdmin ? 'Add the Anthropic API key in Settings → Listing AI first' : 'No API key configured — ask an admin to add it in Settings → Listing AI')
          : String(data?.details || data?.error || `Failed (${st})`);
        if (data?.error === 'no_api_key' || st === 401 || st === 403) fatal = msg;
        throw new Error(msg);
      }
      lastHeaders = data.headers || []; lastKinds = data.kinds || []; model = String(data.model || '');
      slots[idx] = (data.rows || []) as GenRow[];
      const u = data.usage || {};
      tot.input_tokens += u.input_tokens || 0;
      tot.output_tokens += u.output_tokens || 0;
      tot.cache_read_input_tokens += u.cache_read_input_tokens || 0;
      tot.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
      usd += data.estUsd || 0; saved += data.cacheSavedUsd || 0;
      if (data.cacheNote && !cacheWarned) { addToast(String(data.cacheNote), 'error'); cacheWarned = true; }
      doneSkus += chunk.length;
      setHeaders(lastHeaders); setKinds(lastKinds);
      setRows(slots.filter(Boolean).flat() as GenRow[]);
      setUsage({ ...tot }); setCost({ usd, saved });
      setProgress({ done: doneSkus, total: skus.length });
      for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      return String(data.messageId || '');
    };
    const chunkFailed = (idx: number, e: unknown) => {
      failedSkus.push(...chunks[idx].map(s => s.sku));
      if (!fatal && failToasts++ < 3) addToast(friendlyError(e), 'error');
    };

    try {
      // First chunk runs ALONE: the big system prompt (template schema +
      // taught lessons) is cache_control'd, so warming it once means every
      // parallel chunk after it reads the cache instead of each paying to
      // create it — and only then do WORKERS chunks run concurrently.
      let warmId: string | null = null;
      try { warmId = await runChunk(0, null); }
      catch (e) { chunkFailed(0, e); }
      if (!fatal && chunks.length > 1) {
        let cursor = 1;
        const worker = async () => {
          let prev = warmId; // cache-checkup threading, per worker lane
          while (!fatal && cursor < chunks.length) {
            const idx = cursor++;
            try { prev = await runChunk(idx, prev); }
            catch (e) { chunkFailed(idx, e); }
          }
        };
        await Promise.all(Array.from({ length: Math.min(WORKERS, chunks.length - 1) }, () => worker()));
      }
      if (fatal) addToast(fatal, 'error');
      const acc = slots.filter(Boolean).flat() as GenRow[];
      if (acc.length > 0) {
        const okCount = acc.filter(r => r.status === 'ok').length;
        // Failed and never-attempted SKUs are named separately — never present
        // a partial run as a clean success.
        const notAttempted = skus.length - doneSkus - failedSkus.length;
        const bits = [
          failedSkus.length ? `${failedSkus.length} SKU(s) failed (${failedSkus.slice(0, 5).join(', ')}${failedSkus.length > 5 ? '…' : ''})` : '',
          notAttempted > 0 ? `${notAttempted} SKU(s) not attempted` : '',
        ].filter(Boolean).join('; ');
        const tail = bits ? ` — ${bits}; re-run for the rest` : '';
        addToast(`${okCount} of ${acc.length} row(s) generated${tail}`, (bits || okCount === 0) ? 'error' : 'success');
        // Persist the run (survives reload; purged after 5 days). Best-effort
        // — a save failure never hides the on-screen results.
        const { error } = await supabase.from('listing_runs').insert({
          template_id: selected.id, template_name: selected.name, model,
          est_usd: usd, sku_count: skus.length, ok_count: okCount,
          headers: lastHeaders, kinds: lastKinds, rows: acc, usage: tot,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        });
        if (error) addToast(`Run shown but could not be saved for later: ${friendlyError(error)}`, 'error');
        else setSavedCount(n => n + 1);
      }
    } finally { setGenerating(false); }
  };

  return { generating, progress, headers, kinds, rows, usage, cost, runTpl, savedCount, generate, loadRun, preflight, confirmPreflight };
}
