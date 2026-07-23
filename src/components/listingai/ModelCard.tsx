// Admin-only card: pick which Claude model writes the listings. Stored
// server-side (app_secrets via the edge function's set_model action) so every
// device uses the same choice. Prices shown are per million tokens — a
// typical 3-SKU batch uses ~0.02M in + ~0.005M out.
import { useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { call } from './api';

const OPTIONS = [
  { id: 'claude-haiku-4-5', name: 'Haiku — Cheapest', price: '$1 / $5 per M', desc: 'Recommended. 5× cheaper than Opus. Simple, correct listings; dropdown picks are always validated, so nothing unsafe can slip through.' },
  { id: 'claude-sonnet-5', name: 'Sonnet — Balanced', price: '$3 / $15 per M', desc: 'Near-Opus writing quality at ~40% less. Good step up when titles and descriptions need more polish.' },
  { id: 'claude-opus-4-8', name: 'Opus — Best writing', price: '$5 / $25 per M', desc: 'The most polished copy, highest cost. Use for flagship listings or big campaign pushes.' },
];

export default function ModelCard({ model, onSaved, addToast }: {
  model: string;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [saving, setSaving] = useState('');

  const pick = async (id: string) => {
    if (saving || id === model) return;
    setSaving(id);
    try {
      const { status, data } = await call({ action: 'set_model', model: id });
      if (data?.ok) { addToast(`Model changed to ${OPTIONS.find(o => o.id === id)?.name || id} — applies from the next run`, 'success'); onSaved(); }
      else addToast(String(data?.details || data?.error || `Failed (${status})`), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving('');
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>AI model</div>
      {OPTIONS.map(o => {
        const active = o.id === model;
        return (
          <div key={o.id} onClick={() => pick(o.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: active ? 'default' : 'pointer', marginBottom: 6,
              border: `1px solid ${active ? 'oklch(0.55 0.22 265 / .35)' : T.bd}`, background: active ? 'oklch(0.55 0.22 265 / .06)' : 'transparent',
              opacity: saving && saving !== o.id ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto',
            }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? T.ac2 : 'rgba(255,255,255,.12)', flexShrink: 0, marginTop: 5 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: active ? T.ac2 : T.tx }}>{o.name}</span>
                <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'oklch(0.72 0.19 145 / .1)', color: T.gr, fontFamily: T.mono }}>{o.price}</span>
                {saving === o.id && <span style={{ fontSize: 10, color: T.tx3 }}>Saving…</span>}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: T.tx3, marginTop: 2, lineHeight: 1.5 }}>{o.desc}</span>
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, lineHeight: 1.5 }}>
        AI Suggest on the Bulk Teach page always uses the cheapest model — its picks are checked against the marketplace lists either way.
      </div>
    </div>
  );
}
