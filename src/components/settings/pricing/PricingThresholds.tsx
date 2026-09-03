// Threshold rules: a global default plus one row per catalog category —
// minimum margin % on price and maximum cost per piece. Blank = no rule.
// Saved as one app_settings row (pricing_thresholds).
import { Fragment, useMemo, useState } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { useProductCatalog } from '../../../hooks/useProductCatalog';
import { PricingThresholds as Thresholds, Threshold, PRICING_KEYS, savePricingKey } from '../../minis/pricing/pricingConfig';

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16, marginBottom: 16 };
type Draft = Record<string, { minMarginPct: string; maxCost: string }>;
const DEFAULT_KEY = '__default__';
const toDraft = (t: Threshold | undefined) => ({ minMarginPct: t?.minMarginPct == null ? '' : String(t.minMarginPct), maxCost: t?.maxCost == null ? '' : String(t.maxCost) });
const fromDraft = (d: { minMarginPct: string; maxCost: string }): Threshold => ({ minMarginPct: d.minMarginPct.trim() === '' ? null : Number(d.minMarginPct), maxCost: d.maxCost.trim() === '' ? null : Number(d.maxCost) });

export default function PricingThresholds({ thresholds, addToast, onSaved }: { thresholds: Thresholds; addToast: (m: string, t?: string) => void; onSaved: (t: Thresholds) => void }) {
  const { index } = useProductCatalog();
  const categories = useMemo(() => {
    const set = new Set<string>(Object.keys(thresholds.byCategory));
    for (const p of index?.all || []) { const c = (p.category || '').trim().toUpperCase(); if (c) set.add(c); }
    return [...set].sort();
  }, [index, thresholds.byCategory]);
  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = { [DEFAULT_KEY]: toDraft(thresholds.default) };
    for (const c of Object.keys(thresholds.byCategory)) d[c] = toDraft(thresholds.byCategory[c]);
    return d;
  });
  const [saving, setSaving] = useState(false);
  const row = (k: string) => draft[k] || { minMarginPct: '', maxCost: '' };
  const set = (k: string, f: 'minMarginPct' | 'maxCost', v: string) => setDraft(d => ({ ...d, [k]: { ...row(k), [f]: v } }));

  const save = async () => {
    for (const [k, d] of Object.entries(draft)) {
      const t = fromDraft(d);
      if ((t.minMarginPct != null && (t.minMarginPct < 0 || t.minMarginPct >= 100)) || (t.maxCost != null && t.maxCost < 0)) { addToast(`${k === DEFAULT_KEY ? 'Default' : k}: margin must be 0–99% and cost cannot be negative`, 'error'); return; }
    }
    const next: Thresholds = { default: fromDraft(row(DEFAULT_KEY)), byCategory: {} };
    for (const [k, d] of Object.entries(draft)) { if (k === DEFAULT_KEY) continue; const t = fromDraft(d); if (t.minMarginPct != null || t.maxCost != null) next.byCategory[k] = t; }
    setSaving(true);
    const { error } = await savePricingKey(PRICING_KEYS.thresholds, next);
    setSaving(false);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    onSaved(next); addToast('Thresholds saved', 'success');
  };

  const inputs = (k: string) => (
    <>
      <input type="number" min="0" max="99" step="0.5" inputMode="decimal" value={row(k).minMarginPct} onKeyDown={e => numericKeyDown(e)} onChange={e => set(k, 'minMarginPct', e.target.value)} placeholder="—" aria-label="Minimum margin %" style={{ ...S.fInput, fontFamily: T.mono, textAlign: 'right' as const }} />
      <input type="number" min="0" step="1" inputMode="decimal" value={row(k).maxCost} onKeyDown={e => numericKeyDown(e)} onChange={e => set(k, 'maxCost', e.target.value)} placeholder="—" aria-label="Maximum cost per piece" style={{ ...S.fInput, fontFamily: T.mono, textAlign: 'right' as const }} />
    </>
  );

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.tx }}>Thresholds</div>
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>Minimum margin (% of selling price) and maximum cost per piece. A category row overrides the default; a product can override both in the projector.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
        <span style={S.fLabel}>Category</span><span style={S.fLabel}>Min margin %</span><span style={S.fLabel}>Max cost ₹/pc</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>Default (all)</span>{inputs(DEFAULT_KEY)}
        {categories.map(c => (
          <Fragment key={c}>
            <span style={{ fontSize: 12, color: T.tx2 }}>{c}</span>
            {inputs(c)}
          </Fragment>
        ))}
      </div>
      {categories.length === 0 && <div style={{ fontSize: 11, color: T.tx3, marginTop: 8 }}>Catalog categories appear here once the master sheet has synced.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={saving} style={{ ...S.btnPrimary, minHeight: 40, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save thresholds'}</button>
      </div>
    </div>
  );
}
