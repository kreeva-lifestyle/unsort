// Phone spare-parts list, in the Jobwork card style: the SKU's photo, the
// SKU first, category · component, size; the quantity on the right with an
// out-of-stock flag and how many inventory items it could complete. Tap
// shows the matches; swipe reveals Edit / Add / Remove.
import { T } from '../../lib/theme';
import SwipeRow from '../ui/SwipeRow';
import SkuThumb from '../ui/SkuThumb';
import Empty from '../ui/Empty';
import { matchText, type ExtrasListProps } from './ExtrasTable';

export default function ExtrasCards({ rows, canEdit, matchCounts, onMatches, onEdit, onAdjust }: Omit<ExtrasListProps, 'catSku'>) {
  return (<>
    {rows.length === 0 && <Empty icon="search" title="No spare parts found" message="Adjust the filters, or add spare parts to see them here." />}
    {rows.map((ex, idx) => {
      const n = matchCounts[ex.id] || 0;
      return (
        <SwipeRow key={ex.id} hint={idx === 0 && canEdit} hintKey="spare-parts" actions={canEdit ? [
          { label: 'Edit', color: '#6366F1', onClick: () => onEdit(ex) },
          { label: 'Add', color: '#22C55E', onClick: () => onAdjust(ex, 'add') },
          { label: 'Remove', color: '#EF4444', onClick: () => onAdjust(ex, 'remove') },
        ] : []}>
          <div role={n > 0 ? 'button' : undefined} onClick={() => (n > 0 ? onMatches(ex) : undefined)}
            className="jw-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 8, borderRadius: T.rLg, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: n > 0 ? 'pointer' : 'default', transition: 'border-color .15s, background .15s' }}>
            <SkuThumb sku={ex.sku} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.sku}</div>
              <div style={{ fontSize: 12, color: T.tx2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.product_name} · <b style={{ color: T.tx, fontWeight: 600 }}>{ex.component_name}</b></div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 3 }}>{ex.size || '—'}{n > 0 && <span style={{ color: T.yl, fontWeight: 600 }}> · {matchText(n)}</span>}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: ex.quantity > 0 ? T.gr : T.re }}>{ex.quantity}</div>
              {ex.quantity < 1 && <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: T.re, marginTop: 2 }}>Out of stock</div>}
            </div>
          </div>
        </SwipeRow>
      );
    })}
  </>);
}
