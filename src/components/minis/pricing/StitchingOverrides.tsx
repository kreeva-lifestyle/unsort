// Per-product view of the Settings stitching heads: switch a head off for
// this product, or override its rate / quantity. Writes into pricing.stitching.
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import { money } from '../costing/costingModel';
import Toggle from '../../ui/Toggle';
import { BASIS_LABEL } from './pricingConfig';
import type { CostBreakdown, ProductPricing } from './pricingModel';

type Over = NonNullable<ProductPricing['stitching']>[string];

export default function StitchingOverrides({ breakdown, overrides, onChange }: { breakdown: CostBreakdown; overrides: ProductPricing['stitching']; onChange: (next: ProductPricing['stitching']) => void }) {
  const set = (id: string, patch: Partial<Over>) => onChange({ ...(overrides || {}), [id]: { ...((overrides || {})[id] || {}), ...patch } });
  if (breakdown.stitching.length === 0) {
    return <div style={{ fontSize: 11, color: T.tx3, padding: '6px 0' }}>No stitching heads configured — add Cutting / Stitching / Finishing in Settings → Pricing.</div>;
  }
  return (
    <div>
      {breakdown.stitching.map(l => {
        const o = (overrides || {})[l.head.id] || {};
        const overridden = o.rate != null || o.qty != null;
        return (
          <div key={l.head.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${T.bd}`, opacity: l.enabled ? 1 : 0.55 }}>
            <Toggle on={l.enabled} onToggle={() => set(l.head.id, { enabled: !l.enabled })} size="sm" label={`${l.head.name} counted`} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.tx, fontWeight: 600 }}>{l.head.name}{overridden && <span style={{ marginLeft: 6, fontSize: 9, color: T.yl, fontWeight: 700, letterSpacing: '0.06em' }}>OVERRIDE</span>}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={o.rate ?? ''} placeholder={String(l.head.rate)} onKeyDown={e => numericKeyDown(e)}
                  onChange={e => set(l.head.id, { rate: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} aria-label={`${l.head.name} rate`}
                  style={{ ...S.fInput, width: 90, height: 32, padding: '4px 8px', fontFamily: T.mono, textAlign: 'right' as const }} />
                <span style={{ fontSize: 10, color: T.tx3 }}>{BASIS_LABEL[l.head.basis]}</span>
                {l.head.basis === 'per_pc' && <>
                  <span style={{ fontSize: 10, color: T.tx3 }}>×</span>
                  <input type="number" min="0" step="1" inputMode="decimal" value={o.qty ?? ''} placeholder="1" onKeyDown={e => numericKeyDown(e)}
                    onChange={e => set(l.head.id, { qty: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} aria-label={`${l.head.name} quantity`}
                    style={{ ...S.fInput, width: 56, height: 32, padding: '4px 8px', fontFamily: T.mono, textAlign: 'right' as const }} />
                </>}
                {overridden && <button type="button" className="touch44" onClick={() => set(l.head.id, { rate: null, qty: null })} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28 }}>Reset</button>}
              </div>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.tx, textAlign: 'right' }}>{money(l.cost)}</div>
          </div>
        );
      })}
    </div>
  );
}
