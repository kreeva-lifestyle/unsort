// Generation state + loop for Listing AI, extracted from ListingAI.tsx for
// the file budget. Owns results state, chunked edge calls (cache checkup id
// threading, cost accumulation) and SAVES each successful run to
// listing_runs so it survives reloads (5-day retention, pg_cron purge).
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { call, GenRow, GenUsage } from './api';
import { SkuLine } from './skuInput';
import { runValidate, splitIssues, PreflightIssues } from './preflight';
import type { ListingTemplate, ListingRun } from '../../types/database';

const CHUNK = 3;    // SKUs per edge call (server caps at 5) — keeps each call fast
const RUN_CAP = 60; // SKUs per run, so one tap can't burn an unbounded API bill

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
    const acc: GenRow[] = [];
    const tot: GenUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let lastHeaders: string[] = [], lastKinds: string[] = [], model = '';
    // Cache checkup: threading each chunk's message id into the next call
    // lets the API explain any cache miss (cacheNote below).
    let prevMessageId: string | null = null;
    let cacheWarned = false;
    let usd = 0, saved = 0;
    let processed = 0; // SKUs whose chunk completed — the rest were never attempted
    try {
      for (let i = 0; i < skus.length; i += CHUNK) {
        const chunk = skus.slice(i, i + CHUNK);
        let data: any, st = 0;
        try { ({ status: st, data } = await call({ action: 'generate', items: chunk, templateId: selected.id, prevMessageId, force })); }
        catch (e) { addToast(friendlyError(e), 'error'); break; }
        if (!data?.ok) {
          addToast(data?.error === 'no_api_key'
            ? (isAdmin ? 'Add the Anthropic API key in Settings → Listing AI first' : 'No API key configured — ask an admin to add it in Settings → Listing AI')
            : String(data?.details || data?.error || `Failed (${st})`), 'error');
          break;
        }
        lastHeaders = data.headers || []; lastKinds = data.kinds || []; model = String(data.model || '');
        setHeaders(lastHeaders); setKinds(lastKinds);
        acc.push(...((data.rows || []) as GenRow[]));
        const u = data.usage || {};
        tot.input_tokens += u.input_tokens || 0;
        tot.output_tokens += u.output_tokens || 0;
        tot.cache_read_input_tokens += u.cache_read_input_tokens || 0;
        tot.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        usd += data.estUsd || 0; saved += data.cacheSavedUsd || 0;
        prevMessageId = data.messageId || null;
        if (data.cacheNote && !cacheWarned) { addToast(String(data.cacheNote), 'error'); cacheWarned = true; }
        processed = Math.min(i + CHUNK, skus.length);
        setRows([...acc]); setUsage({ ...tot }); setCost({ usd, saved });
        setProgress({ done: processed, total: skus.length });
        for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      }
      if (acc.length > 0) {
        const okCount = acc.filter(r => r.status === 'ok').length;
        // notAttempted > 0 means a chunk failed and the loop stopped early -
        // never present a partial run as a clean success.
        const notAttempted = skus.length - processed;
        const tail = notAttempted > 0 ? ` — run stopped early, ${notAttempted} SKU(s) not attempted; re-run for the rest` : '';
        addToast(`${okCount} of ${acc.length} row(s) generated${tail}`, (notAttempted > 0 || okCount === 0) ? 'error' : 'success');
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
