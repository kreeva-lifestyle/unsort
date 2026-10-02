// Product Costing default (owner's ask): the maintenance % every NEW costing
// sheet starts with, so it no longer has to be typed per product. Saved as
// app_settings.costing_defaults; a sheet can still change its own figure,
// and sheets already saved keep what they have.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { CostingDefaults as Defaults, PRICING_KEYS, savePricingKey } from '../../minis/pricing/pricingConfig';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16 };

export default function CostingDefaults({ defaults, addToast, onSaved }: { defaults: Defaults; addToast: (m: string, t?: string) => void; onSaved: (d: Defaults) => void }) {
  const [pct, setPct] = useState(String(defaults.maintenancePct || ''));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const p = Number(pct) || 0;
    if (p < 0 || p > 500) { addToast('Maintenance % must be 0–500', 'error'); return; }
    const next: Defaults = { maintenancePct: p };
    setSaving(true);
    const { error } = await savePricingKey(PRICING_KEYS.costing, next);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    onSaved(next); addToast('Costing default saved', 'success');
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Product costing default</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>Every new costing sheet starts with this maintenance %. A sheet can still change its own figure; sheets already saved keep theirs.</div>
      <div style={{ maxWidth: 220 }}>
        <label style={S.fLabel}>Default maintenance %</label>
        <input type="number" min="0" max="500" step="0.5" inputMode="decimal" value={pct} onKeyDown={e => numericKeyDown(e)} onChange={e => setPct(e.target.value)} placeholder="0" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...S.btnPrimary, minHeight: 40, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save default'}</button>
      </div>
    </div>
  );
}
