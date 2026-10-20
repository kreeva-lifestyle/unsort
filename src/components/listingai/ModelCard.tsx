// Admin-only card: pick which Claude model and how much effort every AI
// feature uses (Listing AI, product details, pricing suggestions, buyer
// finder). Stored server-side (app_secrets via the listing-ai function's
// set_model / set_effort actions) so every device uses the same choice.
// Prices are per million tokens — a typical 3-SKU batch uses ~0.02M in +
// ~0.005M out; higher effort means more thinking, which is billed as output.
import { useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { call } from './api';

const OPTIONS = [
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5 — Cheapest', price: '$0.10 / $0.50 per M', desc: 'Recommended. About 40× cheaper than Opus. Simple, correct listings; dropdown picks are always validated, so nothing unsafe can slip through.' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5 — Balanced', price: '$2 / $10 per M', desc: 'Near-Opus writing quality at half the price. Good step up when titles and descriptions need more polish.' },
  { id: 'claude-opus-5-5', name: 'Opus 5.5 — Best writing', price: '$4 / $20 per M', desc: 'The most polished copy, highest cost. Use for flagship listings or big campaign pushes.' },
];
// A choice saved for an older model shows as the same tier's current one (the server does the same).
const LEGACY: Record<string, string> = { 'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-sonnet-5': 'claude-sonnet-5-5', 'claude-opus-4-8': 'claude-opus-5-5' };
const EFFORTS = [
  { id: '', name: 'Default', desc: 'The model decides (medium on Haiku and Opus, high on Sonnet).' },
  { id: 'low', name: 'Low', desc: 'Fastest and cheapest. Fine for simple listings.' },
  { id: 'medium', name: 'Medium', desc: 'Balanced speed and care.' },
  { id: 'high', name: 'High', desc: 'Thinks more before writing — better on tricky templates.' },
  { id: 'xhigh', name: 'Extra high', desc: 'Very thorough. Slower; costs noticeably more.' },
  { id: 'max', name: 'Max', desc: 'Most thorough and slowest; costs the most. Rarely needed.' },
];

export default function ModelCard({ model: savedModel, effort, onSaved, addToast }: {
  model: string;
  effort: string;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const model = LEGACY[savedModel] || savedModel;
  const [saving, setSaving] = useState('');
  const [savingEffort, setSavingEffort] = useState<string | null>(null);
  const pickEffort = async (id: string) => {
    if (savingEffort !== null || id === effort) return;
    setSavingEffort(id);
    try {
      const { status, data } = await call({ action: 'set_effort', effort: id });
      if (data?.ok) { addToast(`Effort set to ${EFFORTS.find(e => e.id === id)?.name || id} — applies from the next run`, 'success'); onSaved(); }
      else addToast(friendlyError(data?.details || data?.error || `Failed (${status})`), 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSavingEffort(null);
  };

  const pick = async (id: string) => {
    if (saving || id === model) return;
    setSaving(id);
    try {
      const { status, data } = await call({ action: 'set_model', model: id });
      if (data?.ok) { addToast(`Model changed to ${OPTIONS.find(o => o.id === id)?.name || id} — applies from the next run`, 'success'); onSaved(); }
      else addToast(friendlyError(data?.details || data?.error || `Failed (${status})`), 'error');
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
      <div style={{ fontSize: 11, fontWeight: 600, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>Effort</div>
      <div role="radiogroup" aria-label="Effort" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {EFFORTS.map(e => {
          const active = e.id === effort;
          return (
            <button key={e.id || 'default'} type="button" role="radio" aria-checked={active} onClick={() => pickEffort(e.id)} title={e.desc}
              style={{ minHeight: 40, padding: '6px 12px', borderRadius: 8, border: `1px solid ${active ? 'oklch(0.55 0.22 265 / .35)' : T.bd}`, background: active ? 'oklch(0.55 0.22 265 / .06)' : 'transparent', color: active ? T.ac2 : T.tx2, fontSize: 12, fontWeight: 600, cursor: active ? 'default' : 'pointer', opacity: savingEffort !== null && savingEffort !== e.id ? 0.5 : 1, pointerEvents: savingEffort !== null ? 'none' : 'auto' }}>
              {savingEffort === e.id ? 'Saving…' : e.name}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: T.tx3, marginTop: 6, lineHeight: 1.5 }}>{EFFORTS.find(e => e.id === effort)?.desc}</div>
      <div style={{ fontSize: 10, color: T.tx3, marginTop: 8, lineHeight: 1.5 }}>
        The model and effort apply to every AI feature: listings, product details, pricing suggestions and the buyer finder. AI Suggest on the Bulk Teach page always uses Haiku at low effort — its picks are checked against the marketplace lists either way.
      </div>
    </div>
  );
}
