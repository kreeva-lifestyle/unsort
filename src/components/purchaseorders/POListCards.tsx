// Phone PO list, sorted into sections: each section's heading stays pinned
// while its cards scroll, and every card is Jobwork's (JobCard): SKU photo,
// "DRS187 · PO #111" with the status (or how late) on the right, item ·
// vendor, a thin received bar, counts and due date, and the total. Swipe a
// card for Print; tap it to open the order.
import { T, alpha } from '../../lib/theme';
import SwipeRow from '../ui/SwipeRow';
import type { Section } from './poSections';
import { SECTION_META, STATUS_DOT } from './poSections';
import { Thumb, Title, Item, Bar, Received, Total, day, sectionHint, unitsText } from './poRowParts';
import { StateDot } from './POListTable';
import type { PORow } from './POList';

export default function POListCards({ sections, onOpen, onPrint }: { sections: Section[]; onOpen: (po: PORow) => void; onPrint: (po: PORow) => void }) {
  let first = true;
  return (
    <div style={{ width: '100%' }}>
      {sections.map(s => {
        const m = SECTION_META[s.key];
        return (
          <section key={s.key} id={`po-psec-${s.key}`} style={{ marginTop: 6 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 2px 8px', background: alpha(T.bg, 0.94), backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: m.color }}>{m.label}</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, lineHeight: 1.5, padding: '0 7px', borderRadius: 999, color: m.color, background: alpha(m.color, 0.15) }}>{s.rows.length}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.tx3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{s.key === 'overdue' && s.pending.length ? `${unitsText(s.pending)} past due` : sectionHint(s)}</span>
            </div>
            {s.rows.map(v => {
              const st = STATUS_DOT[v.po.status], done = ['completed', 'closed', 'cancelled'].includes(v.po.status);
              const hint = first; first = false;
              return (
                <SwipeRow key={v.po.id} actions={[{ label: 'Print', color: '#3B82F6', onClick: () => onPrint(v.po) }]} hint={hint} hintKey="po">
                  <div role="button" tabIndex={0} className="jw-card" onClick={() => onOpen(v.po)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(v.po); } }}
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '12px 14px', cursor: 'pointer', marginBottom: 8, opacity: done ? 0.8 : 1, transition: 'border-color .15s, background .15s' }}>
                    <Thumb v={v} size={56} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                        <Title v={v} size={14} />
                        <span style={{ marginLeft: 'auto' }}>{v.late && v.due ? <StateDot label={`${v.due.late} d late`} color={T.re} /> : <StateDot label={st.label} color={st.color} />}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.tx2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Item v={v} /> · <b style={{ color: T.tx, fontWeight: 600 }}>{v.po.vendor_name}</b>
                      </div>
                      <div style={{ margin: '8px 0 6px' }}><Bar v={v} h={3} /></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px 10px', flexWrap: 'wrap', fontSize: 11, color: T.tx3 }}>
                        <span><Received v={v} /></span>
                        {v.due && <span style={{ color: v.pastDue ? T.re : v.due.left === 0 ? T.yl : T.tx3 }}>{v.due.left === 0 && !v.pastDue ? 'due today' : `due ${day(v.due.due)}`}</span>}
                        <span style={{ marginLeft: 'auto' }}><Total v={v} perPiece={false} /></span>
                      </div>
                    </div>
                  </div>
                </SwipeRow>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
