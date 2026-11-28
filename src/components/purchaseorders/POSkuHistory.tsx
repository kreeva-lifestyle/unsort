// Under the SKU box of a PO line: what was ordered before for that design
// (poSkuHistory). An empty line gets one row per earlier fabric of the chosen
// vendor — or of everyone while no vendor is chosen — and a tap fills the
// line (name, code, what it is for, unit; the type and the vendor too while
// those are still empty). Nothing is typed in by itself: on the real orders
// the "obvious" fabric was the wrong one almost half the time. Other vendors'
// fabrics are shown for reference only: a code from another vendor's range is
// not this vendor's code. A filled line says which order it matches, offers
// last time's quantity scaled to this order's pieces, the vendor's other
// fabrics of the design as new lines, and Clear, which takes back exactly
// what the tap wrote.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { usePoSkuHistory, offerFor, isMine, sameFabric, skuKey, suggestQty, type SkuFabric } from './poSkuHistory';
import type { FormItem } from './POItemRows';

const SHOW = 4;
const note: React.CSSProperties = { fontSize: 11, color: T.tx3, lineHeight: 1.45 };
const cut: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const chip: React.CSSProperties = { ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 };
const pick: React.CSSProperties = { ...S.btnGhost, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, width: '100%', minHeight: 48, padding: '6px 12px', textAlign: 'left', color: T.tx, fontWeight: 400 };
const info: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 12px', borderLeft: `2px solid ${T.bd2}`, color: T.tx2 };
const amount = (f: SkuFabric) => `${fmtQty(Number(f.quantity))} ${unitOf(f.unit)}`;
const pcs = (n: number | string) => `${n} ${Number(n) === 1 ? 'pc' : 'pcs'}`;
const rowKey = (f: SkuFabric) => `${f.po_number}|${f.item_name}|${f.fabric_code}`;

/** "Valentino satin hea… · 137": on a narrow screen the name gives way, the code never does (it is what tells two fabrics apart). */
const Label = ({ f, plus }: { f: SkuFabric; plus?: boolean }) => (
  <>
    <span style={cut}>{plus ? '+ ' : ''}{f.item_name}</span>
    {f.fabric_code && <span style={{ flexShrink: 0, whiteSpace: 'pre' }}> · {f.fabric_code}</span>}
  </>
);

/** One earlier fabric: name · code, how much and when, what it was for — and the vendor when that is not obvious. */
const Row = ({ f, named }: { f: SkuFabric; named: boolean }) => {
  const under = [f.component && `for ${f.component}`, named && f.vendor_name, f.orders > 1 && `ordered ${f.orders} times`].filter(Boolean).join(' · ');
  return (
    <>
      <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
        <b style={{ display: 'flex', flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}><Label f={f} /></b>
        <span style={{ ...note, flexShrink: 0, whiteSpace: 'nowrap' }}>{amount(f)} · {shortDate(f.po_date)}</span>
      </span>
      {under && <span style={{ ...note, ...cut }}>{under}</span>}
    </>
  );
};

export default function POSkuHistory({ row, rows, last, vendor, poType, pieces, lumpSum, onFill, onAdd, onClear, onQty }: {
  row: FormItem;
  /** Every line of the form: a fabric already on it is not offered again. */
  rows: FormItem[];
  /** The last line of the form with this code: the design's other fabrics are offered once, there. */
  last: boolean;
  vendor: { id: string | null; name: string };
  poType: string;
  /** The form's "for how many pcs" ('' when not typed, or a lump sum). */
  pieces: string;
  lumpSum: boolean;
  onFill: (f: SkuFabric) => void;
  onAdd: (f: SkuFabric) => void;
  onClear: () => void;
  /** The quantity, with the unit it was ordered in last time. */
  onQty: (q: string, unit: string) => void;
}) {
  const key = skuKey(row.sku);
  // A line already on the order (edit / revise) is its own history: nothing is looked up or offered for it.
  const history = usePoSkuHistory(row.id ? '' : row.sku);
  const [all, setAll] = useState(false);
  const empty = !row.item_name.trim() && !row.fabric_code.trim();
  // Buttons that have just appeared take no tap for a moment, every time they appear (a new code, after Clear, after
  // the name is erased, a filled line's own buttons right after the tap): they push the boxes below them down, and a
  // finger already on its way, or a second tap on the same spot, must not pick something instead.
  // The same when they move: this line stops being its design's last (its chips change), or "N more" opens the list.
  const shownFor = history?.length ? `${empty ? 'rows' : 'filled'}|${key}|${last ? 1 : 0}|${all ? 1 : 0}` : '';
  const [armedFor, setArmedFor] = useState('');
  // Right after a tap the shorter filled block keeps the rows' height for that moment, so the part chips below do not
  // slide up under a second tap.
  const rowsRef = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState(0);
  useEffect(() => {
    if (!shownFor) return;
    const t = window.setTimeout(() => { setArmedFor(shownFor); setHold(0); }, 500);
    return () => { window.clearTimeout(t); setArmedFor(''); };
  }, [shownFor]);
  const guard: React.CSSProperties = armedFor === shownFor ? { transition: 'opacity .2s' } : { opacity: 0.55, pointerEvents: 'none', transition: 'opacity .2s' };

  if (!history?.length) return null;
  const { list, mine, foreign, partial } = offerFor(history, vendor, poType);
  const design = row.sku.trim().toUpperCase();
  // A numbered code alone is the same fabric only within this vendor's range.
  const same = (f: SkuFabric, r: FormItem) => sameFabric(f, r, isMine(f, vendor));
  const onForm = (f: SkuFabric, but?: FormItem) => rows.some(r => r !== but && skuKey(r.sku) === key && same(f, r));

  if (empty) {
    const offer = list.filter(f => !onForm(f, row));
    if (!offer.length) return null;
    const named = foreign || (!vendor.id && !vendor.name.trim());
    return (
      <div ref={rowsRef} style={{ marginBottom: 8 }}>
        <div style={{ ...note, marginBottom: 4 }}>{partial ? `Pick the vendor from the list to fill from its orders. Ordered before for ${design}:` : foreign ? `${design} was never ordered from this vendor. From others, for reference only:` : `Ordered before for ${design}. Tap one to fill this line:`}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(foreign ? {} : guard) }}>
          {(all ? offer : offer.slice(0, SHOW)).map(f => (foreign
            ? <div key={rowKey(f)} style={info}><Row f={f} named /></div>
            : <button key={rowKey(f)} type="button" onClick={() => { setHold(rowsRef.current?.offsetHeight ?? 0); onFill(f); }} style={pick}><Row f={f} named={named} /></button>))}
        </div>
        {offer.length > SHOW && !all && <button type="button" className="touch44" onClick={() => setAll(true)} style={{ ...chip, marginTop: 6 }}>{offer.length - SHOW} more</button>}
      </div>
    );
  }

  const mark = row.filled?.key === key ? row.filled : null;
  const used = (mark && history.find(f => f.po_number === mark.po && same(f, row))) || mine.find(f => same(f, row)) || history.find(f => same(f, row));
  // The chosen vendor's other fabrics of this design, once, under the design's last line.
  const others = last && !foreign ? mine.filter(f => !onForm(f)).slice(0, SHOW) : [];
  // Last time's quantity: offered while the box is empty, or still holds what "Use" wrote (the pieces may have changed since).
  const sug = used && (!row.quantity.trim() || (!!mark?.qty && row.quantity === mark.qty)) ? suggestQty(used, pieces, lumpSum) : null;
  const useIt = sug && String(sug.qty) !== row.quantity.trim() ? sug : null;
  // The quantity below is what "Use" wrote for another piece count: say so, and name the count on the new offer.
  const stale = !!useIt && !!row.quantity.trim();
  const needPieces = !!used && !row.quantity.trim() && !lumpSum && !(Number(pieces) > 0) && Number(used.for_pieces) >= 3;
  // The vendor was changed after the tap, or this fabric was only ever bought from someone else.
  const otherVendor = !!used && !!(vendor.id || vendor.name.trim()) && !isMine(used, vendor);
  if (!used && !others.length) return null;
  return (
    <div style={{ marginBottom: 8, minHeight: armedFor === shownFor ? undefined : hold || undefined }}>
      {used && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ ...note, flex: 1, minWidth: 0 }}>
            {mark ? 'Same as' : 'Ordered before:'} {[`PO #${used.po_number}`, shortDate(used.po_date), used.vendor_name].filter(Boolean).join(' · ')} — {amount(used)}{used.for_pieces ? ` for ${pcs(used.for_pieces)}` : ''}{used.lump_sum ? ' (lump sum)' : ''}
          </div>
          {mark && <button type="button" className="touch44" onClick={onClear} style={{ ...chip, color: T.tx2, flexShrink: 0, ...guard }}>Clear</button>}
        </div>
      )}
      {otherVendor && <div style={{ ...note, color: T.yl }}>That code is from another vendor's range — check it with this vendor.</div>}
      {needPieces && <div style={note}>Type "For how many pcs" above to get last time's quantity for this order.</div>}
      {stale && <div style={{ ...note, color: T.yl }}>The quantity below was worked out for another piece count.</div>}
      {(useIt || others.length > 0) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, ...guard }}>
          {others.map(f => <button key={rowKey(f)} type="button" className="touch44" onClick={() => onAdd(f)} style={{ ...chip, maxWidth: 150 }}><Label f={f} plus /></button>)}
          {/* Last in the row: once used it goes, and no other chip slides into the spot a second tap would hit. */}
          {useIt && used && <button type="button" className="touch44" onClick={() => onQty(String(useIt.qty), used.unit ?? '')} style={chip}>Use {fmtQty(useIt.qty)} {unitOf(used.unit)}{useIt.scaled || stale ? ` for ${pcs(pieces)}` : ''}</button>}
        </div>
      )}
    </div>
  );
}
