// Desktop PO list, sorted into sections (owner's pick): the Jobwork table —
// SKU photo | SKU · PO # and item | vendor and phone | received bar and
// counts | PO date · due and how late | status | total — with a heading row
// per section (Overdue first, in a red wash). The row opens the order; the
// print button shows on hover. Phones use POListCards.
import { T, S, alpha } from '../../lib/theme';
import type { Section } from './poSections';
import { SECTION_META, STATUS_DOT } from './poSections';
import { Thumb, Title, Item, Bar, Received, DueNote, Total, day, sectionHint } from './poRowParts';
import type { PORow } from './POList';

export const StateDot = ({ label, color }: { label: string; color: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color, whiteSpace: 'nowrap' }}>
    <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />{label}
  </span>
);

export default function POListTable({ sections, onOpen, onPrint }: { sections: Section[]; onOpen: (po: PORow) => void; onPrint: (po: PORow) => void }) {
  const th = (label: string, align: 'left' | 'right' = 'left', w?: number) => <th style={{ ...S.thStyle, textAlign: align, width: w, whiteSpace: 'nowrap' }}>{label}</th>;
  const td: React.CSSProperties = { ...S.tdStyle, padding: '10px 14px', verticalAlign: 'middle', borderTop: `1px solid ${T.bd}` };
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
        <thead><tr>{th('', 'left', 64)}{th('PO')}{th('Vendor')}{th('Received', 'left', 240)}{th('PO date · due')}{th('Status')}{th('Total', 'right')}{th('', 'right', 52)}</tr></thead>
        {sections.map((s, si) => {
          const m = SECTION_META[s.key];
          return (
            <tbody key={s.key} id={`po-sec-${s.key}`}>
              <tr>
                <td colSpan={6} style={{ padding: '9px 14px', borderTop: si ? `1px solid ${T.bd2}` : 'none', background: s.key === 'overdue' ? alpha(T.re, 0.07) : 'rgba(255,255,255,0.018)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, lineHeight: 1.5, padding: '0 7px', borderRadius: 999, color: m.color, background: alpha(m.color, 0.15) }}>{s.rows.length}</span>
                    <span style={{ fontSize: 11, color: T.tx3, marginLeft: 6 }}>{sectionHint(s)}</span>
                  </span>
                </td>
                <td colSpan={2} style={{ padding: '9px 14px', textAlign: 'right', borderTop: si ? `1px solid ${T.bd2}` : 'none', background: s.key === 'overdue' ? alpha(T.re, 0.07) : 'rgba(255,255,255,0.018)', fontFamily: T.mono, fontSize: 12, color: T.tx3 }}>
                  {s.total > 0 ? `₹${s.total.toLocaleString('en-IN')}` : ''}
                </td>
              </tr>
              {s.rows.map(v => {
                // Late and not yet arriving: the status says so (a part-received order keeps its own word).
                const st = v.late && v.po.status !== 'partially_received' ? { label: 'Overdue', color: T.re } : STATUS_DOT[v.po.status], done = ['completed', 'closed', 'cancelled'].includes(v.po.status);
                return (
                  <tr key={v.po.id} className="jw-row po-row" onClick={() => onOpen(v.po)} style={{ cursor: 'pointer', opacity: done ? 0.8 : 1 }}>
                    <td style={{ ...td, paddingRight: 0 }}><Thumb v={v} size={44} /></td>
                    <td style={td}>
                      <Title v={v} size={13} />
                      <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}><Item v={v} /></div>
                    </td>
                    <td style={td}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{v.po.vendor_name}</div>
                      {v.po.vendor_phone && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, fontFamily: T.mono }}>{v.po.vendor_phone}</div>}
                    </td>
                    <td style={td}>
                      <div style={{ width: 200 }}><Bar v={v} h={4} /></div>
                      <div style={{ fontSize: 11, color: T.tx3, marginTop: 6, whiteSpace: 'nowrap' }}><Received v={v} /></div>
                    </td>
                    <td style={{ ...td, fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ color: T.tx2 }}>{day(v.po.po_date ?? v.po.created_at)}</span>
                      <span style={{ color: T.tx3 }}> · </span>
                      <span style={{ color: v.late ? T.re : T.tx3 }}>{v.due ? day(v.due.due) : '—'}</span>
                      {v.due && <div style={{ fontSize: 11, marginTop: 3 }}><DueNote v={v} /></div>}
                    </td>
                    <td style={td}><StateDot label={st.label} color={st.color} /></td>
                    <td style={{ ...td, textAlign: 'right' }}><Total v={v} /></td>
                    <td style={{ ...td, padding: '0 10px 0 0', textAlign: 'right' }}>
                      <button type="button" className="po-print" onClick={e => { e.stopPropagation(); onPrint(v.po); }} title="Print" aria-label={`Print PO #${v.po.po_number}`}>
                        <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
