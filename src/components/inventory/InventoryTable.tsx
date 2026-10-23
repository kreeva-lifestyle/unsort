// Desktop inventory list, in the Jobwork style: one row per item with the
// SKU's photo, the SKU first (unique ID and category under it), then size,
// age, tags, notes, a dot status, the missing/damaged chips and the actions.
// The page puts it in the Jobwork frame (rounded box, horizontal scroll);
// phones use InventoryCards (index.css swaps .inv-desktop / .inv-mobile).
import { T, S, Icon } from '../../lib/theme';
import { safeHref } from '../../lib/safeHref';
import SkuThumb from '../ui/SkuThumb';
import { StatusDotLabel, IssueChips, AgeTag, type InvListProps } from './InvBits';

export default function InventoryTable({ rows, items, canEdit, isCompletedView, selectedIds, onSelect, highlightId, itemMissing, itemDamaged, itemTags,
  expandedNote, onToggleNote, completablePairs, revertingId, onView, onEdit, onDelete, onComplete, onRevert, onScrollToPair }: InvListProps & {
  items: any[];
  selectedIds: Set<string>; onSelect: (next: Set<string>) => void;
  highlightId: string | null;
  itemTags: Record<string, any[]>;
  expandedNote: string | null; onToggleNote: (id: string | null) => void;
  completablePairs: Record<string, string[]>;
  revertingId: string | null;
  onComplete: (id: string) => void;
  onRevert: (item: any) => void;
  onScrollToPair: (id: string) => void;
}) {
  const td: React.CSSProperties = { ...S.tdStyle, padding: '10px 14px', verticalAlign: 'middle', borderTop: `1px solid ${T.bd}` };
  const toggle = (id: string, on: boolean) => { const next = new Set(selectedIds); if (on) next.add(id); else next.delete(id); onSelect(next); };
  const toggleAll = (on: boolean) => { const next = new Set(selectedIds); rows.forEach(i => (on ? next.add(i.id) : next.delete(i.id))); onSelect(next); };
  return (
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
        <thead><tr>
          {canEdit && <th style={{ ...S.thStyle, width: 32, paddingLeft: 10, paddingRight: 4 }}>
            <input type="checkbox" checked={rows.length > 0 && rows.every(i => selectedIds.has(i.id))} onChange={e => toggleAll(e.target.checked)} title="Select all on page" style={{ cursor: 'pointer' }} />
          </th>}
          <th style={{ ...S.thStyle, width: 64 }} />
          {['Item', 'Size', 'Age', 'Tags', 'Notes', 'Status', 'Issues', 'Actions'].map(h => <th key={h} style={S.thStyle}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(item => {
          const pair = isCompletedView && item.paired_with ? items.find(p => p.id === item.paired_with) : null;
          const lit = selectedIds.has(item.id) ? 'oklch(0.55 0.22 265 / .10)' : highlightId === item.id ? 'oklch(0.55 0.22 265 / .08)' : undefined;
          return (
            <tr key={item.id} id={'row-' + item.id} className={lit ? undefined : 'jw-row'} style={{ background: lit, transition: 'background .2s' }}>
              {canEdit && <td style={{ ...td, width: 32, paddingLeft: 10, paddingRight: 4 }}>
                <input type="checkbox" checked={selectedIds.has(item.id)} onClick={e => e.stopPropagation()} onChange={e => toggle(item.id, e.target.checked)} style={{ cursor: 'pointer' }} />
              </td>}
              <td style={{ ...td, paddingRight: 0 }}><SkuThumb sku={item.serial_number || ''} size={44} radius={8} zoom /></td>
              <td style={td}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span title={item.serial_number || ''} style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>{item.serial_number || '—'}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.gr }}>{item.batch_number || '—'}</span>
                  {safeHref(item.link) && <a href={safeHref(item.link)} target="_blank" rel="noopener noreferrer" style={{ color: T.bl, display: 'inline-flex' }} aria-label="Open link"><Icon name="link" size={10} /></a>}
                </div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                  {item.products?.name || '—'}{item.location ? ` · ${item.location}` : ''}
                  {pair && <button type="button" onClick={() => onScrollToPair(item.paired_with)} title="Find the paired item" style={{ marginLeft: 6, fontSize: 9, color: T.ac2, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: T.mono }}>⇄ {pair.batch_number}</button>}
                </div>
              </td>
              <td style={{ ...td, fontSize: 11, fontWeight: 500 }}>{item.size || '—'}</td>
              <td style={td}><AgeTag createdAt={item.created_at} /></td>
              <td style={td}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {(itemTags[item.id] || []).map((t: any) => t && <span key={t.id} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'oklch(0.55 0.22 265 / .10)', color: T.ac2 }}>{t.name}</span>)}
                {(itemTags[item.id] || []).length === 0 && <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}
              </div></td>
              <td style={{ ...td, fontSize: 11, maxWidth: 140 }}>{item.notes
                ? <button type="button" onClick={() => onToggleNote(expandedNote === item.id ? null : item.id)} title="Toggle notes" style={{ color: T.tx2, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 'inherit', fontFamily: 'inherit', textAlign: 'left' }}>
                  {expandedNote === item.id ? item.notes : item.notes.length > 25 ? item.notes.slice(0, 25) + '…' : item.notes}</button>
                : <span style={{ color: T.tx3 }}>—</span>}</td>
              <td style={td}><StatusDotLabel status={item.status} /></td>
              <td style={td}><IssueChips missing={itemMissing[item.id] || []} damaged={itemDamaged[item.id] || []} quiet={item.status === 'completed' ? 'All good' : '—'} /></td>
              <td style={td}>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onView(item)} style={{ ...S.btnPrimary, ...S.btnSm }}>View</button>
                  {!isCompletedView && item.status !== 'dry_clean' && completablePairs[item.id]?.length > 0 && (
                    <button type="button" onClick={() => onComplete(item.id)} style={{ ...S.btnSm, borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: T.sans, background: 'oklch(0.72 0.19 145 / .12)', color: T.gr, whiteSpace: 'nowrap' }}>Complete ({completablePairs[item.id].length})</button>
                  )}
                  {isCompletedView && canEdit && (
                    <button type="button" onClick={() => onRevert(item)} style={{ ...S.btnSm, borderRadius: 5, border: '1px solid oklch(0.78 0.18 75 / .15)', cursor: 'pointer', fontWeight: 600, fontFamily: T.sans, background: 'oklch(0.78 0.18 75 / .05)', color: T.yl, whiteSpace: 'nowrap', pointerEvents: revertingId ? 'none' : 'auto', opacity: revertingId === item.id ? 0.6 : 1 }}>
                      {revertingId === item.id ? 'Reverting…' : `Revert${item.paired_with ? ' Both' : ''}`}</button>
                  )}
                  {canEdit && <button type="button" onClick={() => onEdit(item)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>}
                  {canEdit && <button type="button" onClick={() => onDelete(item.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Del</button>}
                </div>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
  );
}
