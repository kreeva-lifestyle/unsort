// Pricing: markup on the vendor cost, a flat ₹ add, rounding, compare-at and a
// floor — with a live preview for a sample cost (same formula as the server).
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import type { PbRounding } from '../../types';
import { previewPrice } from '../../data/websites';
import { rupees } from '../product/status';
import { Field, Grid2, NumInput, Section, Seg } from './ui';
import type { Draft, SetDraft } from './WebsiteEditor';

export const ROUNDINGS: { id: PbRounding; label: string; hint: string }[] = [
  { id: 'none', label: 'No rounding', hint: '1,234.50' },
  { id: 'nearest_10', label: 'Nearest 10', hint: '1,234 → 1,230' },
  { id: 'end_99', label: 'Ends in 99', hint: '1,234 → 1,299' },
  { id: 'end_49_99', label: 'Ends in 49 / 99', hint: '1,234 → 1,249' },
];

export default function PricingSection({ draft, set }: { draft: Draft; set: SetDraft }) {
  const p = draft.pricing;
  const put = (x: Partial<typeof p>) => set({ pricing: { ...p, ...x } });
  const [sample, setSample] = useState<number | null>(1000);
  const out = sample != null ? previewPrice(sample, p) : null;

  return (
    <>
      <Section title="Price formula" hint="The vendor's price in a post is our COST. Selling price = cost × (1 + markup %) + add ₹, then rounded, never below the minimum.">
        <Grid2>
          <Field label="Markup %" htmlFor="pbp-mk" hint="100 = double the cost">
            <NumInput id="pbp-mk" value={p.markup_pct} max={1000} onChange={v => put({ markup_pct: v ?? 0 })} />
          </Field>
          <Field label="Add ₹ (after markup)" htmlFor="pbp-add" hint="Shipping, packing…">
            <NumInput id="pbp-add" value={p.add_flat} max={1000000} onChange={v => put({ add_flat: v ?? 0 })} />
          </Field>
          <Field label="Compare-at % (was price)" htmlFor="pbp-cmp" hint="0 = no struck-out price; 30 = show a price 30% higher">
            <NumInput id="pbp-cmp" value={p.compare_at_pct} max={500} onChange={v => put({ compare_at_pct: v ?? 0 })} />
          </Field>
          <Field label="Minimum price ₹" htmlFor="pbp-min" hint="Empty = no minimum">
            <NumInput id="pbp-min" value={p.min_price} max={10000000} placeholder="No minimum" onChange={v => put({ min_price: v })} />
          </Field>
        </Grid2>
        <Field label="Rounding">
          <Seg label="Rounding" value={p.rounding} onChange={v => put({ rounding: v })} options={ROUNDINGS} />
        </Field>
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.5 }}>A routing rule can replace the markup and add ₹ for the products it sends here (Routing rules → price override).</div>
      </Section>

      <Section title="Preview" hint="Try a cost to see what this store will charge (with the unsaved values above).">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <Field label="Sample cost ₹" htmlFor="pbp-sample">
              <NumInput id="pbp-sample" value={sample} max={10000000} onChange={setSample} />
            </Field>
          </div>
          <div style={{ marginBottom: 14, minWidth: 0 }}>
            {out ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 700, color: T.gr }}>{rupees(out.price)}</span>
                {out.compare_at != null && <span style={{ fontSize: 14, color: T.tx3, textDecoration: 'line-through' }}>{rupees(out.compare_at)}</span>}
              </div>
            ) : <span style={{ ...S.emptyState, padding: 0 }}>Enter a cost</span>}
            {out && sample != null && sample > 0 && (
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Margin {rupees(Math.round((out.price - sample) * 100) / 100)} on {rupees(sample)} cost</div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
