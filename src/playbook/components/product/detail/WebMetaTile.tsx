// "From the website": the details Import from website copied from the other
// store into `attributes` (brand, manufacturer, product type, store tags, SKU,
// barcode, weight, was-price, currency, page title and description, and the
// page's address). Text only — nothing here is edited or sent anywhere; the
// AI reader keeps these keys, and tag templates can use them ({attr:brand}).
// "What the AI read" leaves these keys out so nothing shows twice.
import type { CSSProperties } from 'react';
import type { ProductDetail } from '../../../data/products';
import { PB, pbLabel, pbMeta, pbNum, pbTileTitle } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';
import PbTile, { type PbSpan } from '../../ui/PbTile';

/** Key → label, in the order shown. `mono` = a code or figure people compare. */
const META: { key: string; label: string; mono?: boolean; wide?: boolean }[] = [
  { key: 'brand', label: 'Brand' }, { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'product_type', label: 'Product type' }, { key: 'store_tags', label: 'Store tags', wide: true },
  { key: 'sku', label: 'SKU', mono: true }, { key: 'barcode', label: 'Barcode', mono: true },
  { key: 'weight', label: 'Weight', mono: true }, { key: 'compare_at_price', label: 'Was price', mono: true },
  { key: 'currency', label: 'Currency', mono: true },
  { key: 'seo_title', label: 'Page title', wide: true }, { key: 'seo_description', label: 'Page description', wide: true },
];
/** Every key this tile owns (the AI tile skips them). */
export const WEB_META_KEYS = new Set([...META.map(m => m.key), 'source_page_url']);

const text = (v: unknown) => (v == null ? '' : String(v).trim());
const httpsUrl = (u: string) => (/^https:\/\/[^\s/]+(\/\S*)?$/.test(u) ? u : null);

/** The rows that have a value, plus the original page (https only). */
export function webMeta(p: Pick<ProductDetail, 'attributes' | 'source_url' | 'source'>) {
  const a = (p.attributes ?? {}) as Record<string, unknown>;
  const rows = META.map(m => ({ ...m, value: text(a[m.key]) })).filter(r => r.value);
  const page = httpsUrl(text(a.source_page_url)) ?? (p.source === 'import' ? httpsUrl(text(p.source_url)) : null);
  return { rows, page };
}

const link: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 44, color: PB.tx, fontSize: 13, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 };

/** Nothing when the product carries none of these details. */
export default function WebMetaTile({ p, span }: { p: ProductDetail; span?: PbSpan }) {
  const { rows, page } = webMeta(p);
  if (!rows.length) return null;
  return (
    <PbTile as="section" span={span} aria-labelledby="pb-web-meta-title" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="pb-web-meta-title" style={pbTileTitle}>From the website</h2>
        {page && (
          <a href={page} target="_blank" rel="noopener noreferrer" className="pb-pill" style={link}>
            Open original page<PbIcon name="arrowUpRight" size={14} /><span className="pb-sr"> (opens the other store)</span>
          </a>
        )}
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
        {rows.map(r => (
          <div key={r.key} style={{ minWidth: 0, ...(r.wide ? { gridColumn: '1 / -1' } : null) }}>
            <dt style={{ ...pbLabel, marginBottom: 2 }}>{r.label}</dt>
            <dd style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: PB.tx, overflowWrap: 'anywhere', ...(r.mono ? pbNum : null) }}>{r.value}</dd>
          </div>
        ))}
      </dl>
      <span style={pbMeta}>
        Copied from the other store as it was. Tag templates can use these, e.g. <span style={pbNum}>{'{attr:brand}'}</span> or <span style={pbNum}>{'{attr:product_type}'}</span>.
      </span>
    </PbTile>
  );
}
