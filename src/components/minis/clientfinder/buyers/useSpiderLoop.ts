// Drives a Buyer Spider run: while it is running, call `step` again and again.
// Each step is one site (or the seed's searches), so the loop can be stopped
// between any two taps and the run resumes later exactly where it stopped —
// the queue lives in the database, not here.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { call, explain, type SearchUsage, type StepItem } from './buyerApi';
import type { BuyerRun } from '../../../../types/database';

const BREATHER_MS = 250;   // between steps, so the UI paints each result
const LOG_LINES = 8;

export function useSpiderLoop(run: BuyerRun | null, setRun: Dispatch<SetStateAction<BuyerRun | null>>, onError: (m: string) => void, onUsage: (u: SearchUsage) => void) {
  const [log, setLog] = useState<StepItem[]>([]);
  const [stepping, setStepping] = useState(false);
  const stop = useRef(false);
  const runId = run?.id ?? null;
  const active = run?.status === 'running';

  useEffect(() => {
    if (!runId || !active) return;
    stop.current = false;
    let alive = true;
    // Whatever stopped the loop (the server paused the run on a key or quota
    // problem, or the network dropped), this loop is no longer stepping, so
    // the card must show Paused + Resume — never a live "running" with no
    // loop behind it. Resume re-patches the server to running, idempotently.
    const halt = (msg: string, server?: BuyerRun) => {
      onError(msg);
      setRun(r => (r && r.id === runId ? { ...(server ?? r), status: 'paused', last_error: msg, step_note: msg } : r));
    };
    (async () => {
      setStepping(true);
      while (alive && !stop.current) {
        let data; let status;
        try { ({ status, data } = await call({ action: 'step', run_id: runId })); }
        catch { halt('Network error — the run is still saved; tap Resume to continue'); break; }
        if (!alive) break;
        if (data.search_usage) onUsage(data.search_usage);
        if (!data.ok) { halt(explain(data, status), data.run); break; }
        if (data.run) setRun(data.run);
        if (data.item) setLog(l => [data.item!, ...l].slice(0, LOG_LINES));
        if (data.done) break;
        await new Promise(r => setTimeout(r, BREATHER_MS));
      }
      if (alive) setStepping(false);
    })();
    return () => { alive = false; stop.current = true; setStepping(false); };
    // onError/onUsage/setRun are stable callbacks from the panel; the loop
    // restarts only when the run or its running state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, active]);

  return { log, stepping, clearLog: () => setLog([]) };
}
