// Under the SKU box of a PO line: what was ordered before for that design
// (poSkuHistory). An empty line gets one row per earlier fabric — a tap fills
// the line (name, code, what it is for, unit; the type and the vendor too
// while those are still empty). Nothing is typed in by itself: on the real
// orders the "obvious" fabric was the wrong one almost half the time. A
// filled line says which order it matches, offers last time's quantity
// (scaled to this order's pieces), the vendor's other fabrics of the design
// as new lines, and Clear, which takes back exactly what the tap wrote.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { itemLabel } from './poItemLabel';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { usePoSkuHistory, offerFor, sameFabric, skuKey, suggestQty, type SkuFabric } from './poSkuHistory';
import type { FormItem } from './POItemRows';

const SHOW = 4;
const note: React.CSSProperties = { fontSize: 11, color: T.tx3, lineHeight: 1.45 };
const cut: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const chip: React.CSSProperties = { ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 };
const pick: React.CSSProperties = { ...S.btnGhost, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, width: '100%', minHeight: 48, padding: '6px 12px', textAlign: 'left', color: T.tx, fontWeight: 400 };
const amount = (f: SkuFabric) => `${fmtQty(Number(f.quantity))} ${unitOf(f.unit)}`;

export default function POSkuHistory({ row, rows, last, vendor, poType, pieces, onFill, onAdd, onClear, onQty }: {
  row: FormItem;
  /** Every line of the form: a fabric already on it is not offered again. */
  rows: FormItem[];
  /** The last line of the form with this code: the design's other fabrics are offered once, there. */
  last: boolean;
  vendor: { id: string | null; name: string };
  poType: string;
  /** The form's "for how many pcs" ('' when not typed, or a lump sum). */
  pieces: string;
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
  // Rows that have just appeared take no tap for a moment: they push the boxes below them down, and a finger
  // already on its way to "Fabric name" must not pick a fabric instead.
  const shownFor = history?.length ? key : '';
  const [armedFor, setArmedFor] = useState('');
  useEffect(() => {
    if (!shownFor) return;
    const t = window.setTimeout(() => setArmedFor(shownFor), 500);
    return () => window.clearTimeout(t);
  }, [shownFor]);

  if (!history?.length) return null;
  const { list, mine, foreign } = offerFor(history, vendor, poType);
  const design = row.sku.trim().toUpperCase();
  const onForm = (f: SkuFabric, but?: FormItem) => rows.some(r => r !== but && skuKey(r.sku) === key && sameFabric(f, r));

  if (!row.item_name.trim() && !row.fabric_code.trim()) {
    const offer = list.filter(f => !onForm(f, row));
    if (!offer.length) return null;
    const armed = armedFor === shownFor, named = foreign || (!vendor.id && !vendor.name.trim());
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...note, marginBottom: 4 }}>{foreign ? `No earlier order of ${design} from this vendor. Ordered before from:` : `Ordered before for ${design}. Tap one to fill this line:`}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: armed ? 1 : 0.55, pointerEvents: armed ? 'auto' : 'none', transition: 'opacity .2s' }}>
          {(all ? offer : offer.slice(0, SHOW)).map(f => {
            const under = [f.component && `for ${f.component}`, named && f.vendor_name, f.orders > 1 && `ordered ${f.orders} times`].filter(Boolean).join(' · ');
            return (
              <button key={`${f.po_number}|${f.item_name}|${f.fabric_code}`} type="button" onClick={() => onFill(f)} style={pick}>
                <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
                  <b style={{ ...cut, flex: 1, fontSize: 13, fontWeight: 600 }}>{itemLabel(f)}</b>
                  <span style={{ ...note, flexShrink: 0, whiteSpace: 'nowrap' }}>{amount(f)} · {shortDate(f.po_date)}</span>
                </span>
                {under && <span style={{ ...note, ...cut }}>{under}</span>}
              </button>
            );
          })}
        </div>
        {offer.length > SHOW && !all && <button type="button" className="touch44" onClick={() => setAll(true)} style={{ ...chip, marginTop: 6 }}>{offer.length - SHOW} more</button>}
      </div>
    );
  }

  const mark = row.filled?.key === key ? row.filled : null;
  const used = (mark && history.find(f => f.po_number === mark.po && sameFabric(f, row))) || mine.find(f => sameFabric(f, row)) || history.find(f => sameFabric(f, row));
  // The chosen vendor's other fabrics of this design, once, under the design's last line.
  const others = last && !foreign ? mine.filter(f => !onForm(f)).slice(0, SHOW) : [];
  const sug = used && !row.quantity.trim() ? suggestQty(used, pieces) : null;
  if (!used && !others.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      {used && (
        <div style={note}>
          {mark ? 'Same as' : 'Ordered before:'} {[`PO #${used.po_number}`, shortDate(used.po_date), used.vendor_name].filter(Boolean).join(' · ')} — {amount(used)}{used.lump_sum ? ' (lump sum)' : used.for_pieces ? ` for ${used.for_pieces} pcs` : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
        {sug && used && <button type="button" className="touch44" onClick={() => onQty(String(sug.qty), used.unit ?? '')} style={chip}>Use {fmtQty(sug.qty)} {unitOf(used.unit)}{sug.scaled ? ` for ${pieces} pcs` : ''}</button>}
        {others.map(f => <button key={`${f.po_number}|${f.item_name}|${f.fabric_code}`} type="button" className="touch44" onClick={() => onAdd(f)} style={chip}>+ {itemLabel(f)}</button>)}
        {mark && <button type="button" className="touch44" onClick={onClear} style={{ ...chip, color: T.tx2 }}>Clear</button>}
      </div>
    </div>
  );
}
