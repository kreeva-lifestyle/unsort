// Public seller page: the RateCard Studio "From Master" flow, reachable at
// #/rc/<token> with no login. The token is validated server-side by the
// listing-ai edge fn (ratecard_share, service-role lookup) - the client just
// carries it. Sellers type SKUs, pick columns, add their own markup and get a
// WhatsApp-ready card. Public pages render outside the app shell, so this owns
// its own header and a small inline toast strip (there is no ToastContainer).
import { useState, useCallback } from 'react';
import { T } from '../../../lib/theme';
import RateCardGenerator from './RateCardGenerator';

interface Toast { id: number; msg: string; kind: string }

export default function PublicRateCard({ token }: { token: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((msg: string, kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  return (
    <div style={{ minHeight: '100%', background: T.bg, padding: '16px 14px 40px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img src="/arya-designs-logo.png" alt="Arya Designs" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Rate Card Maker</div>
            <div style={{ fontSize: 11, color: T.tx3 }}>Type the design codes, add your margin, share the card.</div>
          </div>
        </div>

        <RateCardGenerator addToast={addToast} lockedMode="master" shareToken={token} />

        <div style={{ textAlign: 'center', fontSize: 10, color: T.tx3, marginTop: 22, lineHeight: 1.6 }}>
          Arya Designs · ARYA &amp; DRESSTIVE<br />Rates are live from our master sheet.
        </div>
      </div>

      {/* Inline toasts - public pages are outside the app's ToastContainer. */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', left: 12, right: 12, top: 'max(12px, env(safe-area-inset-top))', zIndex: 20000, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: '9px 12px', borderRadius: 8, fontSize: 12, maxWidth: 520, margin: '0 auto', width: '100%',
              background: t.kind === 'error' ? 'oklch(0.63 0.22 25 / .14)' : 'oklch(0.72 0.19 145 / .14)',
              border: `1px solid ${t.kind === 'error' ? 'oklch(0.63 0.22 25 / .35)' : 'oklch(0.72 0.19 145 / .35)'}`,
              color: t.kind === 'error' ? T.re : T.gr, backdropFilter: 'blur(12px)',
            }}>{t.msg}</div>
          ))}
        </div>
      )}
    </div>
  );
}
