// "From the website": the details Import from website copied from the other
// store into `attributes` (when it was uploaded there and on sale since, brand,
// manufacturer, product type, store tags, SKU, barcode, weight, material,
// colour, was-price, currency, page title and description). Text only — nothing here is edited or sent anywhere; the AI
// reader keeps these keys, and tag templates can use them ({attr:brand}).
// Imported products only: on any other product these keys are the AI's. The
// link to the original page is the one in the header (SourceLine), not here.
// "What the AI read" leaves these keys out so nothing shows twice.
import type { ProductDetail } from '../../../data/products';
import { istDate } from '../../../format';
import { PB, pbLabel, pbMeta, pbNum, pbTileTitle } from '../../../pbTheme';
import PbTile, { type PbSpan } from '../../ui/PbTile';

/** Key → label, in the order shown. `mono` = a code or figure people compare; `date` = a date the store keeps. */
const META: { key: string; label: string; mono?: boolean; wide?: boolean; date?: boolean }[] = [
  { key: 'source_created_at', label: 'Uploaded on their site', date: true }, { key: 'source_published_at', label: 'On sale there since', date: true },
  { key: 'brand', label: 'Brand' }, { key: 'manufacturer', label: 'Manufacturer', wide: true },
  { key: 'product_type', label: 'Product type' }, { key: 'material', label: 'Material' }, { key: 'colour', label: 'Colour' },
  { key: 'store_tags', label: 'Store tags (raw)', wide: true },
  { key: 'sku', label: 'SKU', mono: true }, { key: 'barcode', label: 'Barcode', mono: true },
  { key: 'weight', label: 'Weight', mono: true }, { key: 'compare_at_price', label: 'Was price', mono: true },
  { key: 'currency', label: 'Currency', mono: true },
  { key: 'seo_title', label: 'Page title', wide: true }, { key: 'seo_description', label: 'Page description', wide: true },
];
/** Every key this tile owns (the AI tile skips them). */
export const WEB_META_KEYS = new Set([...META.map(m => m.key), 'source_page_url']);

const text = (v: unknown) => (v == null ? '' : String(v).trim());

/** The rows that have a value (imported products only). A long value gets the full width; rupees go unsaid. */
export function webMeta(p: Pick<ProductDetail, 'attributes' | 'source'>) {
  if (p.source !== 'import') return [];
  const a = (p.attributes ?? {}) as Record<string, unknown>;
  // "On sale there since" is said only when it is more than a day apart (a product uploaded as a draft, or shown again later).
  const up = Date.parse(text(a.source_created_at)), sale = Date.parse(text(a.source_published_at));
  const sameDay = Number.isFinite(up) && Number.isFinite(sale) && Math.abs(sale - up) < 86_400_000;
  return META.map(m => ({ ...m, value: m.date && text(a[m.key]) ? istDate(text(a[m.key])) : text(a[m.key]) }))
    .filter(r => r.value && !(r.key === 'currency' && r.value === 'INR') && !(r.key === 'source_published_at' && sameDay))
    .map(r => ({ ...r, wide: r.wide || r.value.length > 40 }));
}

/** Nothing when the product carries none of these details. */
export default function WebMetaTile({ p, span }: { p: ProductDetail; span?: PbSpan }) {
  const rows = webMeta(p);
  if (!rows.length) return null;
  return (
    <PbTile as="section" span={span} aria-labelledby="pb-web-meta-title" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <h2 id="pb-web-meta-title" style={pbTileTitle}>From the website</h2>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        {rows.map(r => (
          <div key={r.key} style={{ minWidth: 0, ...(r.wide ? { gridColumn: '1 / -1' } : null) }}>
            <dt style={{ ...pbLabel, marginBottom: 2 }}>{r.label}</dt>
            <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere', ...(r.mono ? pbNum : null) }}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <span style={pbMeta}>
        Copied from the other store as it was. The store tags are cleaned into the <strong style={{ color: PB.tx, fontWeight: 600 }}>Tags</strong> above (junk such as <span style={pbNum}>_altnew_</span> codes is left out; Settings → Tags has the rules).
        Tag templates can use these, e.g. <span style={pbNum}>{'{attr:brand}'}</span> or <span style={pbNum}>{'{attr:product_type}'}</span>.
      </span>
    </PbTile>
  );
}
