// Stitching cost heads (labour, cutting, finishing…) — each a rate on one
// basis: per piece, per fabric meter, or % of material cost. Saved as one
// app_settings row (pricing_stitching).
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import Toggle from '../../ui/Toggle';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import { StitchHead, StitchBasis, BASIS_LABEL, PRICING_KEYS, savePricingKey, newHeadId } from '../../minis/pricing/pricingConfig';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16 };

export default function StitchingHeads({ heads, addToast, onSaved }: { heads: StitchHead[]; addToast: (m: string, t?: string) => void; onSaved: (h: StitchHead[]) => void }) {
  const [rows, setRows] = useState<StitchHead[]>(heads);
  const [saving, setSaving] = useState(false);
  const { ask, modalProps } = useConfirm();
  const dirty = JSON.stringify(rows) !== JSON.stringify(heads);

  const patch = (i: number, p: Partial<StitchHead>) => setRows(r => r.map((h, j) => (j === i ? { ...h, ...p } : h)));
  const remove = async (i: number) => {
    const h = rows[i];
    if (h.name.trim() && !await ask({ title: `Remove "${h.name}"?`, message: 'Products that override this head keep their override but it will no longer be counted.', confirmLabel: 'Remove', danger: true })) return;
    setRows(r => r.filter((_, j) => j !== i));
  };
  const save = async () => {
    const clean = rows.map(h => ({ ...h, name: h.name.trim(), rate: Number(h.rate) || 0 }));
    if (clean.some(h => !h.name)) { addToast('Every stitching head needs a name', 'error'); return; }
    if (clean.some(h => h.rate < 0)) { addToast('Rates cannot be negative', 'error'); return; }
    setSaving(true);
    const { error } = await savePricingKey(PRICING_KEYS.stitching, clean);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows(clean); onSaved(clean); addToast('Stitching heads saved', 'success');
  };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Stitching cost heads</div>
          <div style={{ fontSize: 11, color: T.tx3 }}>Labour, cutting, finishing… added to every product. Switch a head off to keep it without counting it.</div>
        </div>
        <button type="button" className="touch44" onClick={() => setRows(r => [...r, { id: newHeadId(), name: '', basis: 'per_pc', rate: 0, active: true }])} style={{ ...S.btnGhost, ...S.btnSm, flexShrink: 0 }}>+ Add head</button>
      </div>
      {rows.length === 0 && <div style={{ fontSize: 11, color: T.tx3, padding: '12px 0' }}>No stitching heads yet. Add Cutting, Stitching, Finishing…</div>}
      {rows.map((h, i) => (
        <div key={h.id} className="two-col" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 0.8fr auto auto', gap: 8, alignItems: 'end', padding: '8px 0', borderBottom: `1px solid ${T.bd}` }}>
          <div><label style={S.fLabel}>Head</label><input value={h.name} onChange={e => patch(i, { name: e.target.value })} placeholder="e.g. Cutting" style={S.fInput} /></div>
          <div><label style={S.fLabel}>Basis</label>
            <select value={h.basis} onChange={e => patch(i, { basis: e.target.value as StitchBasis })} style={{ ...S.fInput, cursor: 'pointer' }}>
              {(Object.keys(BASIS_LABEL) as StitchBasis[]).map(b => <option key={b} value={b}>{BASIS_LABEL[b]}</option>)}
            </select></div>
          <div><label style={S.fLabel}>{h.basis === 'pct_of_material' ? 'Percent' : 'Rate ₹'}</label><input type="number" min="0" step="0.01" inputMode="decimal" value={h.rate || ''} onKeyDown={e => numericKeyDown(e)} onChange={e => patch(i, { rate: Math.max(0, Number(e.target.value)) })} placeholder="0" style={{ ...S.fInput, fontFamily: T.mono, textAlign: 'right' as const }} /></div>
          <div style={{ paddingBottom: 6 }}><Toggle on={h.active} onToggle={() => patch(i, { active: !h.active })} size="sm" label={`${h.name || 'head'} active`} /></div>
          <button type="button" className="touch44" onClick={() => remove(i)} style={{ ...S.btnDanger, ...S.btnSm, marginBottom: 2 }}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving || !dirty} style={{ ...S.btnPrimary, minHeight: 40, pointerEvents: saving ? 'none' : 'auto', opacity: saving || !dirty ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save heads'}</button>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}
