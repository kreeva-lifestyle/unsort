// Single-SKU generate for the Dropbox Link Generator. Kept out of the component
// so the generator stays under the file budget, same as bulk.ts.
//
// Both modes are fetched so the Combine/Separate toggle needs no refetch, but
// only the mode ON SCREEN is awaited. Separate mints a shared link per image
// (up to 40), so awaiting both made every Combine generate — the default — wait
// on work the user wasn't looking at.
import { useState, useRef } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { call, explainGen, GenResult } from './api';

export type Mode = 'combine' | 'separate';
export type Pair = { combine: GenResult | null; separate: GenResult | null };

export function useGenOne(mode: Mode, sku: string, addToast: (m: string, t?: string) => void) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Pair | null>(null);
  // The mode still being fetched in the background, so toggling to it can show a
  // "loading" pane instead of the "enter a SKU" empty state.
  const [pending, setPending] = useState<Mode | null>(null);
  // Monotonic generate counter — a slow earlier run must not land on top of a
  // newer one now that the two modes resolve independently.
  const runId = useRef(0);

  const genOne = async (folderPath?: string) => {
    const cur = results?.combine?.sku || results?.separate?.sku || '';
    const s = (folderPath ? cur || sku : sku).trim().toUpperCase();
    if (busy || !s) return;
    const run = ++runId.current;
    // A candidate pick keeps the current card on screen (it holds the candidate
    // buttons being tapped); a fresh generate clears it.
    setBusy(true); if (!folderPath) setResults(null);
    const toRes = (r: { status: number; data: any }): GenResult =>
      r.data.ok ? r.data : { ok: false, sku: s, error: explainGen(r.data, r.status), folder: r.data.folder, candidates: r.data.candidates };
    const fetchMode = (m: Mode) => call({ action: 'linkgen', sku: s, mode: m, folder: folderPath || undefined });
    const other: Mode = mode === 'combine' ? 'separate' : 'combine';

    setPending(other);
    // Buffered as well as merged: the background mode often wins the race (a
    // Separate generate finishes long after its Combine sibling), and at that
    // point `results` is still null from the reset above — merging alone would
    // throw the winner away and leave that pane permanently blank.
    let otherRes: GenResult | null = null;
    // Applied silently — no toast, so the background mode can never talk over
    // the result the user is actually reading.
    const applyOther = (r: GenResult) => {
      if (run !== runId.current) return;
      otherRes = r;
      setResults(prev => prev ? { ...prev, [other]: r } : prev);
    };
    const pOther = fetchMode(other);
    pOther.then(o => applyOther(toRes(o)))
      .catch(() => applyOther({ ok: false, sku: s, error: `Could not load ${other} links — press Generate again` }))
      .finally(() => { if (run === runId.current) setPending(null); });

    try {
      const act = toRes(await fetchMode(mode));
      if (run !== runId.current) return;
      setResults({ combine: null, separate: null, [mode]: act, ...(otherRes ? { [other]: otherRes } : {}) } as Pair);
      setBusy(false);
      if (act.ok) addToast(`${mode === 'combine' ? 'Combine' : 'Separate'} links ready for ${s}`, 'success');
      else addToast(act.error || 'Could not generate links', act.candidates?.length ? 'info' : 'error');
    } catch (e) {
      if (run !== runId.current) return;
      addToast(friendlyError(e), 'error'); setBusy(false);
    }
  };

  return { busy, results, pending, genOne };
}
