// Phone inventory list, in the Jobwork card style (one card per item): the SKU's photo, the SKU
// first with its unique ID, category · size · location, the age, a dot
// status, the missing/damaged chips. Tap opens the item; swipe reveals
// View / Edit / Del; a long press (editors, not on completed items) opens
// the quick-status sheet the page owns.
import { useRef } from 'react';
import { T } from '../../lib/theme';
import SwipeRow from '../ui/SwipeRow';
import SkuThumb from '../ui/SkuThumb';
import { STATUS_DOT_COLOR } from './invStatus';
import { StatusDotLabel, IssueChips, AgeTag, type InvListProps } from './InvBits';

export default function InventoryCards({ rows, canEdit, itemMissing, itemDamaged, onView, onEdit, onDelete, onQuickStatus }: InvListProps & {
  onQuickStatus: (id: string) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const longPressed = useRef(false); // swallow the click that follows a long press
  return (<>
    {rows.map((item, idx) => {
      const actions = [
        { label: 'View', color: '#6366F1', onClick: () => onView(item) },
        ...(canEdit ? [{ label: 'Edit', color: '#3B82F6', onClick: () => onEdit(item) }, { label: 'Del', color: '#EF4444', onClick: () => onDelete(item.id) }] : []),
      ];
      return (
        <SwipeRow key={item.id} actions={actions} hint={idx === 0} hintKey="inventory">
          <div role="button" className="jw-card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', marginBottom: 8, borderRadius: T.rLg, border: `1px solid ${T.bd}`, borderLeft: `3px solid ${STATUS_DOT_COLOR[item.status] || T.yl}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none', transition: 'border-color .15s, background .15s' }}
            onClick={() => { if (longPressed.current) { longPressed.current = false; return; } onView(item); }}
            onTouchStart={() => { longPressed.current = false; if (!canEdit || item.status === 'completed') return; timer.current = setTimeout(() => { try { navigator.vibrate?.(15); } catch { /* not supported */ } longPressed.current = true; onQuickStatus(item.id); }, 500); }}
            onTouchEnd={() => clearTimeout(timer.current)} onTouchMove={() => clearTimeout(timer.current)}>
            <SkuThumb sku={item.serial_number || ''} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.serial_number || '—'}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.gr, flexShrink: 0 }}>{item.batch_number || ''}</span>
                <span style={{ marginLeft: 'auto', flexShrink: 0 }}><StatusDotLabel status={item.status} size={7} /></span>
              </div>
              <div style={{ fontSize: 12, color: T.tx2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b style={{ color: T.tx, fontWeight: 600 }}>{item.products?.name || '—'}</b> · {item.size || '—'} · {item.location || '—'}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <AgeTag createdAt={item.created_at} />
                <IssueChips missing={itemMissing[item.id] || []} damaged={itemDamaged[item.id] || []} />
              </div>
            </div>
          </div>
        </SwipeRow>
      );
    })}
  </>);
}
