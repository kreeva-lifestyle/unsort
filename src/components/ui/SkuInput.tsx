// One SKU box, used everywhere a SKU is typed: Cash Challan, Purchase Orders,
// Brand Tags, Dropbox Link Generator, Client Finder.
//
// Native <datalist>, matching the pattern already in BrandTagModal and
// ProgramForm — the browser handles positioning, keyboard and touch, which a
// hand-rolled dropdown gets wrong on mobile far more often than not.
//
// It ALWAYS accepts free text. A challan can legitimately bill something that
// was never in the master sheet, so this suggests but never constrains.
import { useId } from 'react';
import { T } from '../../lib/theme';
import { useProductCatalog, searchProducts, findProduct, type Product } from '../../hooks/useProductCatalog';

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
  /** Fired when the typed text resolves to a real catalog SKU. */
  onPick?: (p: Product) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
} & Record<string, unknown>) {
  const listId = useId();
  const { products } = useProductCatalog();

  // Only build options once there is something to filter on: rendering 1,280
  // <option>s per empty box would cost more than it helps.
  const opts = value.trim().length >= 1 ? searchProducts(products, value, 40) : [];

  const handle = (next: string) => {
    onChange(next);
    if (!onPick) return;
    // Datalist selection arrives as a plain change event indistinguishable from
    // typing, so resolve on every change and let the caller decide what to do.
    const hit = findProduct(products, next);
    if (hit) onPick(hit);
  };

  return (
    <>
      <input
        {...rest}
        list={listId}
        value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={e => handle(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={style}
      />
      <datalist id={listId}>
        {opts.map(p => (
          <option key={p.sku_norm} value={p.sku}>
            {[p.title, p.price_exc_gst != null ? `₹${Number(p.price_exc_gst).toLocaleString('en-IN')}` : null,
              p.is_active ? null : 'Discontinued']
              .filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>
    </>
  );
}

/** Shown under a SKU box once it resolves — confirms what was picked. */
export function SkuHint({ product }: { product: Product | null }) {
  if (!product) return null;
  return (
    <div style={{ fontSize: 9, color: product.is_active ? T.tx3 : T.yl, marginTop: 2, lineHeight: 1.4 }}>
      {[product.title, product.size, product.is_active ? null : 'Discontinued'].filter(Boolean).join(' · ')}
    </div>
  );
}
