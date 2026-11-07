// Live Telegram status for Settings: loads pb_tg_config + the waiting count,
// then refreshes on its own — every 5 s while a link code is waiting to be
// used (so "Linked" shows up by itself), else every 30 s — paused while the
// page is hidden, once more when it comes back (states-and-feedback.md §2).
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import { activeCode, getTgStatus, type TgStatus } from '../data/telegram';

export function useTgStatus() {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const s = await getTgStatus();
      if (my === seq.current) { setStatus(s); setError(''); }
    } catch (e) {
      if (my === seq.current) setError(friendlyError(e));
    } finally { if (my === seq.current) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The server clears the code once /link used it.
  const waitingForLink = !!activeCode(status?.config ?? null);
  useEffect(() => {
    const every = waitingForLink ? 5_000 : 30_000;
    const t = setInterval(() => { if (!document.hidden) void load(); }, every);
    const back = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [load, waitingForLink]);

  return { status, error, loading, reload: load, setStatus };
}
