// Under the SKU box of a PO line: what was ordered before for that design
// (poSkuHistory). One earlier fabric → the line fills by itself (name, code,
// what it is for, unit — and the vendor and type when those are still empty)
// and says which order it came from, with Clear. Several → one row each, a
// tap fills the line; nothing is guessed. On a filled line the design's other
// fabrics can be added as new lines, and last time's quantity is offered —
// scaled to this order's pieces — but never typed in by itself.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { itemLabel } from './poItemLabel';
import { fmtQty, unitOf } from './poStats';
import { shortDate } from './POHeaderInfo';
import { usePoSkuHistory, pickFor, sameFabric, skuKey, suggestQty, type SkuFabric } from './poSkuHistory';
import type { FormItem } from './POItemRows';

const SHOW = 4;
const note: React.CSSProperties = { fontSize: 11, color: T.tx3, lineHeight: 1.45 };
const link: React.CSSProperties = { border: 'none', background: 'none', color: T.ac2, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '0 4px' };

export default function POSkuHistory({ row, rows, last, vendorId, pieces, onFill, onAdd, onClear, onQty }: {
  row: FormItem;
  /** Every line of the form: a fabric already on it is not offered again. */
  rows: FormItem[];
  /** The last line of the form with this code: the design's other fabrics are offered once, there. */
  last: boolean;
  vendorId: string | null;
  /** The form's "for how many pcs" ('' when not typed, or a lump sum). */
  pieces: string;
  onFill: (f: SkuFabric) => void;
  onAdd: (f: SkuFabric) => void;
  onClear: () => void;
  onQty: (q: string) => void;
}) {
  const key = skuKey(row.sku);
  // A line already on the order (edit / revise) is its own history: nothing is looked up or offered for it.
  const history = usePoSkuHistory(row.id ? '' : row.sku);
  const [all, setAll] = useState(false);
  const { list, auto, foreign } = pickFor(history ?? [], vendorId);
  const empty = !row.item_name.trim() && !row.fabric_code.trim();
  // One candidate fills the empty line by itself — once per code: a line cleared on purpose stays clear.
  const autoKey = auto && empty && !row.id && row.autoSku !== key ? `${key}|${auto.po_number}` : '';
  useEffect(() => {
    if (autoKey && auto) onFill(auto);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per code and candidate
  }, [autoKey]);

  if (!history?.length) return null;
  const from = (f: SkuFabric) => [`PO #${f.po_number}`, shortDate(f.po_date), f.vendor_name].filter(Boolean).join(' · ');
  const used = list.find(f => sameFabric(f, row)) ?? history.find(f => sameFabric(f, row));
  const onForm = (f: SkuFabric) => rows.some(r => skuKey(r.sku) === key && sameFabric(f, r));
  const others = list.filter(f => !onForm(f));

  if (empty) {
    if (auto && row.autoSku !== key) return null; // being filled
    const shown = all ? list : list.slice(0, SHOW);
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...note, marginBottom: 4 }}>{foreign ? 'This vendor has not supplied this design. Ordered before from:' : `Ordered before for ${row.sku.trim().toUpperCase()} — tap to fill:`}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shown.map(f => (
            <button key={`${f.item_name}|${f.fabric_code}`} type="button" onClick={() => onFill(f)}
              style={{ ...S.btnGhost, minHeight: 44, justifyContent: 'space-between', gap: 10, textAlign: 'left', color: T.tx, background: T.glass1, borderColor: T.bd }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ fontWeight: 600 }}>{itemLabel(f)}</b>{f.component && <span style={{ color: T.tx3 }}> for {f.component}</span>}</span>
              <span style={{ ...note, flexShrink: 0, textAlign: 'right' }}>{foreign || !vendorId ? f.vendor_name : `${fmtQty(Number(f.quantity))} ${unitOf(f.unit)}`} · {shortDate(f.po_date)}</span>
            </button>
          ))}
        </div>
        {list.length > SHOW && !all && <button type="button" className="touch44" onClick={() => setAll(true)} style={link}>{list.length - SHOW} more</button>}
      </div>
    );
  }

  const sug = used && !row.quantity.trim() ? suggestQty(used, pieces) : null;
  if (!used && !others.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      {used && (
        <div style={note}>
          {row.autoSku === key ? 'Same as' : 'Ordered before:'} {from(used)}
          {row.autoSku === key && <button type="button" className="touch44" onClick={onClear} style={link}>Clear</button>}
        </div>
      )}
      {sug && used && (
        <div style={{ ...note, marginTop: 2 }}>
          Last time {fmtQty(Number(used.quantity))} {unitOf(used.unit)}{used.for_pieces ? ` for ${used.for_pieces} pcs` : ''}
          <button type="button" className="touch44" onClick={() => onQty(String(sug.qty))} style={link}>Use {fmtQty(sug.qty)} {unitOf(used.unit)}{sug.scaled ? ` for ${pieces} pcs` : ''}</button>
        </div>
      )}
      {others.length > 0 && last && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
          <span style={note}>Also for this design:</span>
          {others.slice(0, SHOW).map(f => (
            <button key={`${f.item_name}|${f.fabric_code}`} type="button" className="touch44" onClick={() => onAdd(f)}
              style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, padding: '4px 12px', fontSize: 11, borderRadius: 999 }}>+ {itemLabel(f)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
