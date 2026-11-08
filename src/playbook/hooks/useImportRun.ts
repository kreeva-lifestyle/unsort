// The newest import run, for the progress tile at the top of Products: loads
// it, then while it is queued / running refreshes every 10 s (paused while
// the page is hidden, once more when it comes back — states-and-feedback.md
// §2). A finished run stays until Dismiss (remembered per device) or 24 h.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import { isActiveRun, latestImportRun, type ImportRunRow } from '../data/imports';

const KEY = 'pb-import-dismissed';
const KEEP_HOURS = 24;
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

export function useImportRun() {
  const [run, setRun] = useState<ImportRunRow | null>(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await latestImportRun();
      if (my === seq.current) { setRun(r); setError(''); }
    } catch (e) {
      // The tile keeps what it has and says it could not refresh; a toast would only cover the header.
      if (my === seq.current) setError(friendlyError(e));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const active = isActiveRun(run);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (!document.hidden) void reload(); }, 10_000);
    const back = () => { if (!document.hidden) void reload(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [active, reload]);

  const dismiss = useCallback((id: string) => {
    const next = [...dismissed.filter(x => x !== id), id].slice(-20);
    setDismissed(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: it comes back on reload */ }
  }, [dismissed]);

  const fresh = run && (active || (run.finished_at && Date.now() - new Date(run.finished_at).getTime() < KEEP_HOURS * 3600_000));
  const shown = run && fresh && !dismissed.includes(run.id) ? run : null;
  return { run: shown, active, error, reload, dismiss };
}
