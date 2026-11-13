// Pricing: markup on the vendor cost, a flat ₹ add, rounding and a floor, then
// the was price (one % or a random range, sections/WasPrice.tsx) — with a live
// preview for a sample cost (same formula as the server, data/pricing.ts).
// Layout: (Price formula 12) / (Was price 12) / (Preview 12) / (Products already
// on this website 12: "Update prices on Shopify", the saved formula for every
// listing already here); the three formula fields sit in one row on a wide
// body and one per row on phone (Trio: never 2 + 1).
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { PbRounding } from '../../types';
import { repriceWebsite, repricedMessage } from '../../data/websites';
import { previewPrice } from '../../data/pricing';
import type { AddToast } from '../PbToasts';
import { PbButton } from '../ui';
import { PB, pbMeta, pbNum } from '../../pbTheme';
import { rupees } from '../product/status';
import { Field, NumInput, Section, Seg } from './ui';
import { Cell, SectionGrid, Trio } from './sections/SectionGrid';
import WasPrice, { WasPreview } from './sections/WasPrice';
import type { Draft, SetDraft } from './WebsiteEditor';

export const ROUNDINGS: { id: PbRounding; label: string; hint: string }[] = [
  { id: 'none', label: 'No rounding', hint: '1,234.50' },
  { id: 'nearest_10', label: 'Nearest 10', hint: '1,234 becomes 1,230' },
  { id: 'end_99', label: 'Ends in 99', hint: '1,234 becomes 1,299' },
  { id: 'end_49_99', label: 'Ends in 49 / 99', hint: '1,234 becomes 1,249' },
];

export default function PricingSection({ siteId, dirty, draft, set, addToast }: { siteId: string; dirty: boolean; draft: Draft; set: SetDraft; addToast: AddToast }) {
  const [busy, setBusy] = useState(false);
  const reprice = async () => {
    setBusy(true);
    try { addToast(repricedMessage(await repriceWebsite(siteId)), 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  const p = draft.pricing;
  const put = (x: Partial<typeof p>) => set({ pricing: { ...p, ...x } });
  const [sample, setSample] = useState<number | null>(1000);
  const out = sample != null ? previewPrice(sample, p) : null;

  return (
    <SectionGrid>
      <Cell><Section title="Price formula" hint="The vendor's price in a post is our COST. Selling price = cost × (1 + markup %) + add ₹, then rounded, never below the minimum.">
        <Trio>
          <Field label="Markup %" htmlFor="pbp-mk" hint="100 = double the cost">
            <NumInput id="pbp-mk" value={p.markup_pct} max={1000} onChange={v => put({ markup_pct: v ?? 0 })} />
          </Field>
          <Field label="Add ₹ (after markup)" htmlFor="pbp-add" hint="Shipping, packing…">
            <NumInput id="pbp-add" value={p.add_flat} max={1000000} onChange={v => put({ add_flat: v ?? 0 })} />
          </Field>
          <Field label="Minimum price ₹" htmlFor="pbp-min" hint="Empty = no minimum">
            <NumInput id="pbp-min" value={p.min_price} max={10000000} placeholder="No minimum" onChange={v => put({ min_price: v })} />
          </Field>
        </Trio>
        <Field label="Rounding">
          <Seg label="Rounding" value={p.rounding} onChange={v => put({ rounding: v })} options={ROUNDINGS} />
        </Field>
        <div style={pbMeta}>A routing rule can replace the markup and add ₹ for the products it sends here (Routing rules, price override).</div>
        <div style={{ ...pbMeta, marginTop: 8 }}>Products copied from another website are not priced by this formula: they sell at the price that website had. Only the was price below is added to them.</div>
      </Section></Cell>

      <Cell><WasPrice p={p} put={put} /></Cell>

      <Cell><Section title="Preview" hint="Try a cost to see what this store will charge (with the unsaved values above). Copied products keep their copied price instead.">
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', maxWidth: 320, minWidth: 0 }}>
            <Field label="Sample cost ₹" htmlFor="pbp-sample">
              <NumInput id="pbp-sample" value={sample} max={10000000} onChange={setSample} />
            </Field>
          </div>
          <div aria-live="polite" style={{
            flex: '2 1 240px', minWidth: 0, marginBottom: 16, padding: '12px 16px', borderRadius: PB.r.btn, boxSizing: 'border-box',
            background: PB.ctl, border: `1px solid ${PB.ctlBd}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
          }}>
            {out ? (
              <>
                <span style={{ ...pbMeta }}>Sells at</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ ...pbNum, fontSize: 28, fontWeight: 500, lineHeight: 1.2, color: PB.tx, overflowWrap: 'anywhere' }}>{rupees(out.price)}</span>
                  <WasPreview price={out.price} p={p} />
                </span>
                {sample != null && sample > 0 && (
                  <span style={pbMeta}>Margin <span style={pbNum}>{rupees(Math.round((out.price - sample) * 100) / 100)}</span> on <span style={pbNum}>{rupees(sample)}</span> cost</span>
                )}
              </>
            ) : <span style={{ ...pbMeta }}>Enter a cost to see the price.</span>}
          </div>
        </div>
      </Section></Cell>

      <Cell><Section title="Products already on this website" hint="New pricing applies to listings written from now on. This gives every listing already here the price from the saved formula and updates the changed ones on Shopify. The written text stays; a price typed by hand is kept.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <PbButton icon="refresh" onClick={() => void reprice()} busy={busy} busyLabel="Updating…" dim={dirty}>Update prices on Shopify</PbButton>
          {dirty && <span style={pbMeta}>Save your changes first.</span>}
        </div>
      </Section></Cell>
    </SectionGrid>
  );
}
