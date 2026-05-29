import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';
import { T } from '../../lib/theme';
import TracklyLanding from './TracklyLanding';
import TracklyImport from './TracklyImport';

const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';
const ALLOWED_SCHEMES = ['http:', 'https:'];
// Only this short code shows the Arya Designs Matrix landing + Self Import.
// Every other short link redirects instantly, as before.
const LANDING_CODE = 'RW5Un';

export default function TracklyRedirect({ shortCode }: { shortCode: string }) {
  const [status, setStatus] = useState<'loading' | 'landing' | 'import' | 'notfound' | 'error'>('loading');
  const [longUrl, setLongUrl] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(EDGE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ action: 'resolve', shortCode }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const data = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        if (data.ok && typeof data.longUrl === 'string') {
          let target: URL;
          try { target = new URL(data.longUrl); } catch { setStatus('notfound'); return; }
          if (!ALLOWED_SCHEMES.includes(target.protocol)) { setStatus('notfound'); return; }
          // Only the hardcoded landing code gets the Matrix landing page.
          if (shortCode !== LANDING_CODE) { window.location.replace(target.href); return; }
          setLongUrl(target.href);
          setStatus('landing');
        } else {
          setStatus('notfound');
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if ((err as Error)?.name !== 'AbortError') setStatus('error');
      }
    })();
    return () => { ctrl.abort(); };
  }, [shortCode]);

  if (status === 'landing') return <TracklyLanding longUrl={longUrl} onImport={() => setStatus('import')} />;
  if (status === 'import') return <TracklyImport onBack={() => setStatus('landing')} />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.tx, fontFamily: T.sans, padding: 20, textAlign: 'center' as const }}>
      {status === 'loading' && (
        <div>
          <div style={{ width: 32, height: 32, border: `3px solid ${T.bd2}`, borderTopColor: '#22C55E', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 13, color: T.tx2 }}>Loading…</div>
        </div>
      )}
      {status === 'notfound' && (
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Sora, Inter, sans-serif' }}>Link not found</div>
          <div style={{ fontSize: 13, color: T.tx3 }}>This link does not exist or has been removed.</div>
        </div>
      )}
      {status === 'error' && (
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'Sora, Inter, sans-serif' }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: T.tx3 }}>Please try again later.</div>
        </div>
      )}
    </div>
  );
}
