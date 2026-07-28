// One SKU box, used everywhere a SKU is typed: Cash Challan, Purchase Orders,
// Brand Tags, Dropbox Link Generator, Client Finder.
//
// Two-step by design. The datalist suggests the PARENT design (DRS141); if that
// design comes in sizes, a row of size chips appears and picking one writes
// DRS141-S. Suggesting every variant up front would turn ~300 designs into
// ~1,800 dropdown entries and bury the design you actually wanted.
//
// Stitch types never get a size step: SEMI-STITCHED and UNSTITCHED are how a
// garment is made, not what size it is.
//
// It ALWAYS accepts free text — a challan can legitimately bill something the
// master sheet never had, so this suggests but never constrains.
import { useId, useState, useEffect, useRef } from 'react';
import { T } from '../../lib/theme';
import {
  useProductCatalog, searchProducts, resolveSku, needsSize, variantSku, type Product,
} from '../../hooks/useProductCatalog';

// Typing is faster than rendering. Filtering per keystroke makes a fast typist
// wait on work that is thrown away; one frame's pause does not.
const DEBOUNCE_MS = 120;

export default function SkuInput({
  value,
  onChange,
  onPick,
  placeholder = 'SKU',
  style,
  disabled,
  onKeyDown,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  /** Fired when the text resolves to a real design. `size` is null when the
   *  design has no sizes, or when the user has not chosen one yet. */
  onPick?: (p: Product, size: string | null, fullSku: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
} & Record<string, unknown>) {
  const listId = useId();
  const { index } = useProductCatalog();
  const [query, setQuery] = useState(value);

  // Debounce only the SEARCH, never the input value — the box itself must stay
  // perfectly responsive; it is the dropdown that can lag a frame.
  useEffect(() => {
    const t = setTimeout(() => setQuery(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const hit = resolveSku(index, value);
  const product = hit?.product ?? null;
  const chosenSize = hit?.size ?? null;
  const showSizes = !!product && needsSize(product) && !chosenSize;

  // Fire onPick once per resolved code, not on every keystroke that happens to
  // still resolve — otherwise a challan row would re-fill its price constantly.
  const lastFired = useRef<string>('');
  useEffect(() => {
    if (!onPick || !product) { lastFired.current = ''; return; }
    if (needsSize(product) && !chosenSize) return;   // wait for the size choice
    const full = chosenSize ? variantSku(product, chosenSize) : product.sku;
    if (lastFired.current === full) return;
    lastFired.current = full;
    onPick(product, chosenSize, full);
  }, [product, chosenSize, onPick]);

  const opts = query.trim() ? searchProducts(index, query, 25) : [];

  return (
    <div style={{ minWidth: 0 }}>
      <input
        {...rest}
        list={listId}
        value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', ...style }}
      />
      <datalist id={listId}>
        {opts.map(p => (
          <option key={p.sku_norm} value={p.sku}>
            {[
              p.title,
              p.price_exc_gst != null ? `₹${Number(p.price_exc_gst).toLocaleString('en-IN')}` : null,
              needsSize(p) ? `${p.sizes.length} sizes` : null,
              p.is_active ? null : 'Discontinued',
            ].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>

      {showSizes && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: T.tx3, letterSpacing: '0.06em' }}>SIZE</span>
          {product!.sizes.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(variantSku(product!, s))}
              style={{
                padding: '3px 9px', minHeight: 26, fontSize: 11, fontWeight: 600,
                borderRadius: 5, cursor: 'pointer', fontFamily: T.mono,
                background: T.ac3, color: T.ac2, border: `1px solid ${T.bd2}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {product && !showSizes && (
        <div style={{ fontSize: 9, color: product.is_active ? T.tx3 : T.yl, marginTop: 2, lineHeight: 1.4 }}>
          {[product.title, chosenSize ? `Size ${chosenSize}` : null, product.is_active ? null : 'Discontinued']
            .filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}
