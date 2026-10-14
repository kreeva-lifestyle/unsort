// Drives a Buyer Spider run: while it is running, call `step` again and again.
// Each step is one site (or the seed's searches), so the loop can be stopped
// between any two taps and the run resumes later exactly where it stopped —
// the queue lives in the database, not here.
import { useEffect, useRef, useState } from 'react';
import { call, explain, type StepItem } from './buyerApi';
import type { BuyerRun } from '../../../../types/database';

const BREATHER_MS = 250;   // between steps, so the UI paints each result
const LOG_LINES = 8;

export function useSpiderLoop(run: BuyerRun | null, setRun: (r: BuyerRun) => void, onError: (m: string) => void) {
  const [log, setLog] = useState<StepItem[]>([]);
  const [stepping, setStepping] = useState(false);
  const stop = useRef(false);
  const runId = run?.id ?? null;
  const active = run?.status === 'running';

  useEffect(() => {
    if (!runId || !active) return;
    stop.current = false;
    let alive = true;
    (async () => {
      setStepping(true);
      while (alive && !stop.current) {
        let data; let status;
        try { ({ status, data } = await call({ action: 'step', run_id: runId })); }
        catch { onError('Network error — the run is still saved; tap Resume to continue'); break; }
        if (!alive) break;
        if (!data.ok) { onError(explain(data, status)); if (data.run) setRun(data.run); break; }
        if (data.run) setRun(data.run);
        if (data.item) setLog(l => [data.item!, ...l].slice(0, LOG_LINES));
        if (data.done) break;
        await new Promise(r => setTimeout(r, BREATHER_MS));
      }
      if (alive) setStepping(false);
    })();
    return () => { alive = false; stop.current = true; setStepping(false); };
    // onError/setRun are stable callbacks from the panel; the loop restarts
    // only when the run or its running state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, active]);

  return { log, stepping, clearLog: () => setLog([]) };
}
