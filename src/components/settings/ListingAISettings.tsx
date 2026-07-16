// Settings → Listing AI (admin only): manage the Anthropic API key that
// powers the Listing AI module. The key is stored server-side in the
// app_secrets vault via the listing-ai edge function — never in the browser.
import { useState, useEffect, useCallback } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { call } from '../listingai/api';
import KeyCard from '../listingai/KeyCard';
import ModelCard from '../listingai/ModelCard';

export default function ListingAISettings({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [model, setModel] = useState('');
  const [err, setErr] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { status, data } = await call({ action: 'status' });
      if (data?.ok) { setHasKey(!!data.hasKey); setModel(String(data.model || '')); setErr(''); }
      else setErr(String(data?.details || data?.error || `Failed (${status})`));
    } catch (e) { setErr(friendlyError(e)); }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.sora, color: T.tx, marginBottom: 2 }}>Listing AI</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14, lineHeight: 1.6 }}>
        The AI key used to generate marketplace listings. Create one at console.anthropic.com → API Keys.
        It is checked with Anthropic before saving and stored on the server only.
      </div>
      {err && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 12 }}>{err}</div>
      )}
      {hasKey !== null && <KeyCard hasKey={hasKey} onSaved={loadStatus} addToast={addToast} />}
      {hasKey !== null && <ModelCard model={model} onSaved={loadStatus} addToast={addToast} />}
      <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.7 }}>
        Templates, SKUs and generation live in the Listing AI tab. Price-like columns are always exported blank,
        and columns with fixed dropdown lists only ever receive values from those lists.
      </div>
    </div>
  );
}
