// One SKU box, used everywhere a SKU is typed: Cash Challan, Purchase Orders,
// Brand Tags, Dropbox Link Generator, Client Finder.
//
// Two-step by design. The dropdown suggests the PARENT design (DRS141); if that
// design comes in sizes, a row of size chips appears and picking one writes
// DRS141-S. Suggesting every variant up front would turn ~300 designs into
// ~1,800 dropdown entries and bury the design you actually wanted.
//
// Stitch types never get a size step: SEMI-STITCHED and UNSTITCHED are how a
// garment is made, not what size it is.
//
// It ALWAYS accepts free text — a challan can legitimately bill something the
// master sheet never had, so this suggests but never constrains.
import { useMemo, useEffect, useRef, useState } from 'react';
import { T } from '../../lib/theme';
import AnchoredList from './AnchoredList';
import {
  useProductCatalog, searchProducts, resolveSku, needsSize, variantSku, type Product,
} from '../../hooks/useProductCatalog';

// Suggestions start here. One character is noise — "D" matches 289 designs and
// "7" matches 130 — so the dropdown stayed open over the fields below while
// showing nothing useful.
//
// Trade-off accepted knowingly: the 68 SKUs that are only three characters
// long (994, 221, 330...) now appear only once typed in full. The other 1,202
// designs still get a head start.
const MIN_CHARS = 3;

export default function SkuInput({
  value,
  onChange,
  onPick,
  placeholder = 'SKU',
  style,
  disabled,
  onKeyDown,
  sizes = true,
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
  /** Folder-based callers (Client Finder, Dropbox Link Generator) pass false:
   *  Dropbox folders are named by the PARENT design, a size is meaningless
   *  there — no size chips, onPick fires on the parent straight away. */
  sizes?: boolean;
} & Record<string, unknown>) {
  const { index } = useProductCatalog();
  // The list is our own (portaled) dropdown, not a <datalist>: iOS Safari
  // never shows datalist suggestions, so on the owner's phone typing a SKU
  // silently offered nothing. Keyboard flow mirrors a datalist on desktop —
  // arrows move the highlight, Enter picks only when something is highlighted,
  // so callers' own Enter handlers (next row, generate) still fire otherwise.
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);

  const hit = resolveSku(index, value);
  const product = hit?.product ?? null;
  const chosenSize = hit?.size ?? null;
  const showSizes = sizes && !!product && needsSize(product) && !chosenSize;

  // Fire onPick once per resolved code, not on every keystroke that happens to
  // still resolve — otherwise a challan row would re-fill its price constantly.
  const lastFired = useRef<string>('');
  useEffect(() => {
    if (!onPick || !product) { lastFired.current = ''; return; }
    if (sizes && needsSize(product) && !chosenSize) return;   // wait for the size choice
    const full = chosenSize ? variantSku(product, chosenSize) : product.sku;
    if (lastFired.current === full) return;
    lastFired.current = full;
    onPick(product, chosenSize, full);
  }, [product, chosenSize, onPick, sizes]);

  // Built from `value` itself, NOT a delayed copy of it. The previous version
  // debounced the search by 120ms while the browser filtered the resulting
  // options against the live text, so the dropdown was permanently one
  // keystroke behind — it showed matches for what you typed a moment ago.
  //
  // The debounce existed to avoid re-filtering the catalog per keystroke; the
  // binary-search index answers a prefix query in ~0.15us, so it was guarding
  // nothing and causing the lag it was meant to prevent. useMemo is per
  // instance, unlike the module-level memo it replaces, which a challan with
  // several rows would have thrashed.
  const q = value.trim();
  const opts = useMemo(
    () => (q.length >= MIN_CHARS ? searchProducts(index, q, 25) : []),
    [index, q],
  );
  // Like a browser datalist, never offer the exact text already in the box.
  const listOpts = useMemo(() => { const k = q.toUpperCase(); return opts.filter(p => p.sku_norm !== k); }, [opts, q]);
  const showList = open && listOpts.length > 0;

  const pick = (p: Product) => { onChange(p.sku); setOpen(false); setHi(-1); };

  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % listOpts.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h <= 0 ? listOpts.length - 1 : h - 1)); return; }
      if (e.key === 'Enter' && hi >= 0 && listOpts[hi]) { e.preventDefault(); pick(listOpts[hi]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setHi(-1); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div style={{ minWidth: 0 }}>
      <input
        {...rest}
        ref={setAnchor}
        value={value}
        disabled={disabled}
        onKeyDown={keyDown}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setHi(-1); }, 150)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showList}
        style={{ width: '100%', ...style }}
      />
      <AnchoredList anchor={anchor} open={showList}>
        {listOpts.map((p, i) => (
          // onMouseDown + preventDefault fires before the input's blur, so the
          // tap lands even though the list closes on blur.
          <div
            key={p.sku_norm}
            role="option"
            aria-selected={i === hi}
            onMouseDown={e => { e.preventDefault(); pick(p); }}
            onMouseEnter={() => setHi(i)}
            style={{ padding: '8px 12px', minHeight: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, cursor: 'pointer', background: i === hi ? T.ac3 : 'transparent', borderBottom: `1px solid ${T.bd}` }}
          >
            <span style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 600 }}>{p.sku}</span>
            <span style={{ fontSize: 10, color: p.is_active ? T.tx3 : T.yl, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[
                p.title,
                p.price_exc_gst != null ? `₹${Number(p.price_exc_gst).toLocaleString('en-IN')}` : null,
                needsSize(p) ? `${p.sizes.length} sizes` : null,
                p.is_active ? null : 'Discontinued',
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))}
      </AnchoredList>

      {showSizes && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: T.tx3, letterSpacing: '0.06em' }}>SIZE</span>
          {product!.sizes.map(s => (
            <button
              key={s}
              type="button"
              className="touch44"
              onClick={() => onChange(variantSku(product!, s))}
              style={{
                padding: '4px 12px', minHeight: 30, fontSize: 11, fontWeight: 600,
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
