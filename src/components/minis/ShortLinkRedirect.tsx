// Public hash route #/s/:code — resolves short link via edge function and redirects.
// No Supabase URL is exposed to end users; they only see the app domain.

import { useEffect, useState } from 'react';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';
import { T } from '../../lib/theme';

const EDGE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';
const ALLOWED_SCHEMES = ['http:', 'https:'];

export default function ShortLinkRedirect({ shortCode }: { shortCode: string }) {
  const [status, setStatus] = useState<'loading' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(EDGE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'resolve', shortCode }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (data.ok && typeof data.longUrl === 'string') {
          let target: URL;
          try { target = new URL(data.longUrl); } catch { setStatus('notfound'); return; }
          if (!ALLOWED_SCHEMES.includes(target.protocol)) { setStatus('notfound'); return; }
          window.location.replace(target.href);
        } else {
          setStatus('notfound');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [shortCode]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, color: T.tx, fontFamily: T.sans, padding: 20, textAlign: 'center' as const }}>
      {status === 'loading' && (
        <div>
          <div style={{ width: 32, height: 32, border: `3px solid ${T.bd2}`, borderTopColor: T.ac, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 13, color: T.tx2 }}>Redirecting…</div>
        </div>
      )}
      {status === 'notfound' && (
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: T.sora }}>Link not found</div>
          <div style={{ fontSize: 13, color: T.tx3 }}>This link does not exist or has been removed.</div>
        </div>
      )}
      {status === 'error' && (
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: T.sora }}>Something went wrong</div>
          <div style={{ fontSize: 13, color: T.tx3 }}>Please try again later.</div>
        </div>
      )}
    </div>
  );
}
