import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';
import { T } from '../../lib/theme';
import TracklyLanding from './TracklyLanding';
import TracklyImport from './TracklyImport';

const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';
const ALLOWED_SCHEMES = ['http:', 'https:'];
const LANDING_CODE = 'RW5Un';

// Fire the resolve fetch at module load time — before React's useEffect cycle starts.
// This runs the instant the lazy chunk finishes parsing, saving ~30ms on every open.
const _preCode = window.location.hash.match(/^#\/s\/([a-zA-Z0-9_-]{3,32})/)?.[1];
const _prefetchData: Promise<any> | null = _preCode
  ? fetch(EDGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'resolve', shortCode: _preCode }),
    }).then(r => r.json()).catch(() => null)
  : null;

// localStorage cache — 24h TTL so repeat visitors (vendors) never wait for the network.
function getCachedUrl(code: string): string | null {
  try {
    const raw = localStorage.getItem(`tly_${code}`);
    if (!raw) return null;
    const { url, exp } = JSON.parse(raw);
    return exp > Date.now() ? url : null;
  } catch { return null; }
}
function setCachedUrl(code: string, url: string) {
  try { localStorage.setItem(`tly_${code}`, JSON.stringify({ url, exp: Date.now() + 86_400_000 })); } catch {}
}

export default function TracklyRedirect({ shortCode }: { shortCode: string }) {
  const [status, setStatus] = useState<'loading' | 'landing' | 'import' | 'notfound' | 'error'>(() => {
    if (shortCode === LANDING_CODE && getCachedUrl(shortCode)) return 'landing';
    return 'loading';
  });
  const [longUrl, setLongUrl] = useState(() => {
    if (shortCode === LANDING_CODE) return getCachedUrl(shortCode) || '';
    return '';
  });

  useEffect(() => {
    // Cache hit — already showing landing, no network needed
    if (shortCode === LANDING_CODE && longUrl) return;

    const ctrl = new AbortController();
    (async () => {
      try {
        // Use pre-fetched promise when possible; avoids starting a second request
        const data = (_prefetchData && _preCode === shortCode)
          ? await _prefetchData
          : await fetch(EDGE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
              body: JSON.stringify({ action: 'resolve', shortCode }),
              signal: ctrl.signal,
            }).then(r => r.json()).catch(() => null);

        if (ctrl.signal.aborted) return;
        if (!data) { setStatus('error'); return; }
        if (data.ok && typeof data.longUrl === 'string') {
          let target: URL;
          try { target = new URL(data.longUrl); } catch { setStatus('notfound'); return; }
          if (!ALLOWED_SCHEMES.includes(target.protocol)) { setStatus('notfound'); return; }
          if (shortCode !== LANDING_CODE) { window.location.replace(target.href); return; }
          setCachedUrl(shortCode, target.href);
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
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.tx, fontFamily: T.sans, padding: 20, textAlign: 'center' as const }}>
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
