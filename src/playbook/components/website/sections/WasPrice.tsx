// Was price: the higher price the store shows crossed out next to the selling
// price (Shopify's "compare-at" price). One % for every product, or a random
// whole % per product inside a range the owner types (owner, 2026-11-13). The
// server picks each product's % from its id (pb-products/pricing.ts
// comparePct), so a product keeps the same was price every time it is sent.
// Data: pricing.compare_at_pct (the one %, or the range's From) and
// compare_at_max_pct (the range's To; null = one %).
import type { PbPricing } from '../../../types';
import { badWasRange, compareAtPrice, compareAtRange } from '../../../data/pricing';
import { PB, pbMeta, pbNum } from '../../../pbTheme';
import { rupees } from '../../product/status';
import { Field, NumInput, Section, Seg } from '../ui';

type Mode = 'one' | 'range';
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'one', label: 'One %', hint: 'The same on every product' },
  { id: 'range', label: 'Random range', hint: 'Each product gets its own %' },
];
const MAX = 500;

/** Two fields side by side on a wide tile (one per row on phone); a lone field keeps the same width. */
const pair = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', columnGap: 16, maxWidth: 560, minWidth: 0 } as const;

export default function WasPrice({ p, put }: { p: PbPricing; put: (x: Partial<PbPricing>) => void }) {
  const mode: Mode = p.compare_at_max_pct != null ? 'range' : 'one';
  const pick = (m: Mode) => {
    if (m === mode) return;
    if (m === 'one') { put({ compare_at_max_pct: null }); return; }
    const from = p.compare_at_pct > 0 ? p.compare_at_pct : 20;
    put({ compare_at_pct: from, compare_at_max_pct: Math.min(MAX, from + 20) });
  };
  const err = badWasRange(p) ? `Enter a number above ${p.compare_at_pct}` : ''; // the editor's Save refuses it too
  return (
    <Section title="Was price (compare-at)" hint="A higher price shown crossed out next to the selling price. It is worked out from the selling price, so copied products get it too.">
      <div style={{ maxWidth: 560, marginBottom: 16 }}>
        <Seg label="How the was price is set" value={mode} onChange={pick} options={MODES} />
      </div>
      {mode === 'one' ? (
        <div style={pair}>
          <Field label="Was price %" htmlFor="pbp-cmp" hint="0 = no was price. 30 = 30% above the selling price.">
            <NumInput id="pbp-cmp" value={p.compare_at_pct} max={MAX} onChange={v => put({ compare_at_pct: v ?? 0 })} describedBy="pbp-cmp-hint" />
          </Field>
        </div>
      ) : (
        <>
          <div style={pair}>
            <Field label="From %" htmlFor="pbp-cmp">
              <NumInput id="pbp-cmp" value={p.compare_at_pct} max={MAX} onChange={v => put({ compare_at_pct: v ?? 0 })} describedBy="pbp-cmp-range" />
            </Field>
            <Field label="To %" htmlFor="pbp-cmp-to" error={err || undefined}>
              <NumInput id="pbp-cmp-to" value={p.compare_at_max_pct ?? 0} max={MAX} onChange={v => put({ compare_at_max_pct: v ?? 0 })}
                describedBy={err ? 'pbp-cmp-to-error pbp-cmp-range' : 'pbp-cmp-range'} />
            </Field>
          </div>
          <div id="pbp-cmp-range" style={{ ...pbMeta, maxWidth: 640 }}>
            Each product gets its own whole % in this range and keeps it every time it is sent.
            {p.compare_at_pct === 0 && ' A product that gets 0% shows no was price.'}
          </div>
        </>
      )}
    </Section>
  );
}

const del = (v: number) => <del style={{ ...pbNum, fontSize: 15, color: PB.tx2 }}>{rupees(v)}</del>;

/** The Preview tile's crossed-out part next to the price: one was price, or a range's lowest to highest. */
export function WasPreview({ price, p }: { price: number; p: PbPricing }) {
  const range = compareAtRange(price, p);
  if (!range) {
    const one = compareAtPrice(price, p);
    return one == null ? null : <span><span className="pb-sr">Was </span>{del(one)}</span>;
  }
  const { low, high } = range;
  if (high == null) return null;
  if (low === high) return <span><span className="pb-sr">Was </span>{del(high)}</span>;
  return (
    <span style={{ ...pbMeta, fontSize: 15 }}>
      <span className="pb-sr">Was </span>{low == null ? 'up to ' : <>{del(low)} to </>}{del(high)}
    </span>
  );
}
