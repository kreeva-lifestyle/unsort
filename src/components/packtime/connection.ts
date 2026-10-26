// Is the connection actually working? The phone's own online/offline events
// only fire when the radio is off; weak Wi-Fi with a dead uplink looks
// "online" and the app used to learn otherwise only when a scan failed,
// 14 s later. While scanning, a tiny request goes out every 12 s: two misses
// in a row = weak, the next hit = fine. A real "offline" from the phone wins.
import { useEffect, useState } from 'react';
import { SUPABASE_URL } from '../../lib/supabase';
import { drainOutbox } from './outbox';

export type Connection = 'online' | 'weak' | 'offline';

const PING_EVERY_MS = 12_000;
const PING_TIMEOUT_MS = 5_000;

async function ping(): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { cache: 'no-store', signal: ctl.signal });
    return r.ok;
  } catch { return false; }
  finally { clearTimeout(t); }
}

export function useConnection(active: boolean): Connection {
  const [state, setState] = useState<Connection>(navigator.onLine ? 'online' : 'offline');
  useEffect(() => {
    const goOff = () => setState('offline');
    const goOn = () => { setState('online'); void drainOutbox(); };
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    return () => { window.removeEventListener('offline', goOff); window.removeEventListener('online', goOn); };
  }, []);
  useEffect(() => {
    if (!active) return;
    let misses = 0, stopped = false;
    const tick = async () => {
      if (stopped || !navigator.onLine || document.visibilityState !== 'visible') return;
      const ok = await ping();
      if (stopped) return;
      misses = ok ? 0 : misses + 1;
      setState(prev => (!navigator.onLine ? 'offline' : misses >= 2 ? 'weak' : ok && prev !== 'online' ? 'online' : prev));
      if (ok && misses === 0) void drainOutbox();
    };
    const iv = setInterval(tick, PING_EVERY_MS);
    void tick();
    return () => { stopped = true; clearInterval(iv); };
  }, [active]);
  return state;
}
