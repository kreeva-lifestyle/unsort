// Profit defaults (the projector prefills these per product). Saved as
// app_settings.pricing_defaults. Maintenance always applies to the whole
// make (fabric + material + stitching), so there is nothing to choose here.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { PricingDefaults as Defaults, PRICING_KEYS, savePricingKey } from '../../minis/pricing/pricingConfig';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16 };

export default function PricingDefaults({ defaults, addToast, onSaved }: { defaults: Defaults; addToast: (m: string, t?: string) => void; onSaved: (d: Defaults) => void }) {
  const [pct, setPct] = useState(String(defaults.profit.pct || ''));
  const [fixed, setFixed] = useState(String(defaults.profit.fixed || ''));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const p = Number(pct) || 0, f = Number(fixed) || 0;
    if (p < 0 || p >= 100) { addToast('Profit % must be 0–99', 'error'); return; }
    if (f < 0) { addToast('Fixed profit cannot be negative', 'error'); return; }
    const next: Defaults = { profit: { pct: p, fixed: f } };
    setSaving(true);
    const { error } = await savePricingKey(PRICING_KEYS.defaults, next);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    onSaved(next); addToast('Pricing defaults saved', 'success');
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Profit defaults</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>Target price = (cost + fixed profit) ÷ (1 − profit %). Both can be used together; a product can change them. Maintenance % (from the costing sheet) applies to fabric + material + stitching.</div>
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={S.fLabel}>Profit %</label><input type="number" min="0" max="99" step="0.5" inputMode="decimal" value={pct} onKeyDown={e => numericKeyDown(e)} onChange={e => setPct(e.target.value)} placeholder="0" style={{ ...S.fInput, fontFamily: T.mono, textAlign: 'right' as const }} /></div>
        <div><label style={S.fLabel}>Fixed profit ₹/pc</label><input type="number" min="0" step="1" inputMode="decimal" value={fixed} onKeyDown={e => numericKeyDown(e)} onChange={e => setFixed(e.target.value)} placeholder="0" style={{ ...S.fInput, fontFamily: T.mono, textAlign: 'right' as const }} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...S.btnPrimary, minHeight: 40, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save defaults'}</button>
      </div>
    </div>
  );
}
