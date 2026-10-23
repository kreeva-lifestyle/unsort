// Desktop spare-parts list, in the Jobwork style: the SKU's photo, the SKU
// first (category and component under it), size, the quantity with an
// out-of-stock flag, matching inventory items, and the actions. Phones use
// ExtrasCards (index.css swaps .inv-extra-desktop / .inv-extra-mobile).
import { T, S } from '../../lib/theme';
import SkuThumb from '../ui/SkuThumb';
import Empty from '../ui/Empty';
import type { InventoryExtra } from '../../types/database';

export interface ExtrasListProps {
  rows: InventoryExtra[];
  canEdit: boolean;
  matchCounts: Record<string, number>;
  /** The category's own code, shown after its name. */
  catSku: (productId: string) => string | undefined;
  onMatches: (ex: InventoryExtra) => void;
  onEdit: (ex: InventoryExtra) => void;
  onAdjust: (ex: InventoryExtra, mode: 'add' | 'remove') => void;
}

export const matchText = (n: number) => `${n} match${n > 1 ? 'es' : ''}`;

export default function ExtrasTable({ rows, canEdit, matchCounts, catSku, onMatches, onEdit, onAdjust }: ExtrasListProps) {
  const td: React.CSSProperties = { ...S.tdStyle, padding: '10px 14px', verticalAlign: 'middle', borderTop: `1px solid ${T.bd}` };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
      <thead><tr>
        <th style={{ ...S.thStyle, width: 64 }} />
        {['Spare part', 'Size', 'Qty', 'Matches', 'Actions'].map(h => <th key={h} style={S.thStyle}>{h}</th>)}
      </tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 12 }}><Empty icon="search" title="No spare parts found" message="Adjust the filters, or add spare parts to see them here." /></td></tr>}
        {rows.map(ex => {
          const n = matchCounts[ex.id] || 0, sku = catSku(ex.product_id);
          return (
            <tr key={ex.id} className="jw-row">
              <td style={{ ...td, paddingRight: 0 }}><SkuThumb sku={ex.sku} size={44} radius={8} zoom /></td>
              <td style={td}>
                <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>{ex.sku}</div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{ex.product_name}{sku ? <span style={{ fontFamily: T.mono }}> ({sku})</span> : null} · <b style={{ color: T.tx2, fontWeight: 600 }}>{ex.component_name}</b></div>
              </td>
              <td style={{ ...td, fontSize: 11, fontWeight: 500 }}>{ex.size || '—'}</td>
              <td style={td}>
                <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: ex.quantity > 0 ? T.gr : T.re }}>{ex.quantity}</span>
                {ex.quantity < 1 && <span style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', background: 'oklch(0.63 0.22 25 / .10)', color: T.re }}>Out of stock</span>}
              </td>
              <td style={td}>{n > 0
                ? <button type="button" onClick={() => onMatches(ex)} title="View matching items" style={{ color: T.yl, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', padding: 0, fontFamily: T.sans }}>{matchText(n)}</button>
                : <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                {canEdit ? <div style={{ display: 'flex', gap: 3 }}>
                  <button type="button" onClick={() => onEdit(ex)} style={{ ...S.btnGhost, ...S.btnSm }} title="Edit spare part">Edit</button>
                  <button type="button" onClick={() => onAdjust(ex, 'add')} style={{ ...S.btnSuccess, ...S.btnSm }} title="Add quantity">Add</button>
                  <button type="button" onClick={() => onAdjust(ex, 'remove')} style={{ ...S.btnDanger, ...S.btnSm }} title="Remove quantity">Remove</button>
                </div> : <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
