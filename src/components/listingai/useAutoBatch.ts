// Auto-run queue for SKU lists past the per-run cap: slices the pasted list
// into RUN_CAP-sized batches and runs them back-to-back, so a 500-SKU list is
// one tap instead of hand-trimmed re-runs. Client-side on purpose —
// generation spends real AI money and needs the owner's template + preflight
// choices, so batches only run while the owner's tab is open (a deliberate
// decision against an unattended server cron). Each batch saves as its own
// Recent Run, so a mid-flight Stop loses nothing already generated.
import { useRef, useState } from 'react';
import { RUN_CAP, useGenerateRun } from './useGenerateRun';
import { SkuLine } from './skuInput';
import type { ListingTemplate } from '../../types/database';

export function useAutoBatch(gen: ReturnType<typeof useGenerateRun>, addToast: (m: string, t?: string) => void) {
  const [state, setState] = useState<{ current: number; total: number } | null>(null);
  const [stopping, setStopping] = useState(false);
  // Ref mirror of the gen state — waitIdle polls it without stale closures.
  const genRef = useRef(gen);
  genRef.current = gen;
  const stopRef = useRef(false);

  // Idle = no run in flight AND no preflight panel waiting on the owner. A
  // batch that pauses on preflight stays "busy" here until the owner's
  // clean/force tap finishes the run (or cancel skips just that batch).
  const waitIdle = () => new Promise<void>(resolve => {
    const t = setInterval(() => {
      if (!genRef.current.generating && !genRef.current.preflight) { clearInterval(t); resolve(); }
    }, 500);
  });

  const start = async (tpl: ListingTemplate, skus: SkuLine[], isAdmin: boolean) => {
    if (state || gen.generating) return;
    const batches: SkuLine[][] = [];
    for (let i = 0; i < skus.length; i += RUN_CAP) batches.push(skus.slice(i, i + RUN_CAP));
    stopRef.current = false;
    setStopping(false);
    try {
      for (let i = 0; i < batches.length; i++) {
        if (stopRef.current) {
          addToast(`Auto-run stopped — batches ${i + 1}–${batches.length} were not run; their SKUs are still in the box`, 'success');
          return;
        }
        setState({ current: i + 1, total: batches.length });
        await genRef.current.generate(tpl, batches[i], isAdmin);
        await waitIdle();
      }
      addToast(`Auto-run finished — ${batches.length} batches, ${skus.length} SKUs. Every batch is saved in Recent runs.`, 'success');
    } finally { setState(null); setStopping(false); }
  };

  // Halts AFTER the in-flight batch (an AI run can't be aborted midway
  // without throwing away its spend).
  const stop = () => { stopRef.current = true; setStopping(true); };

  return { active: !!state, current: state?.current ?? 0, total: state?.total ?? 0, stopping, start, stop };
}
