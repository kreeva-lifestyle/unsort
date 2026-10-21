// The count strip above the sectioned PO list: one segment per section on
// screen ("8 overdue · 1 to approve · 4 with vendor …") and, on a desktop,
// what is still with vendors (sent or part received, per unit). A segment
// jumps to its section. It scrolls sideways rather than push the page wider.
import { T } from '../../lib/theme';
import type { Section } from './poSections';
import { SECTION_META, pendingOf } from './poSections';
import { unitsText } from './poRowParts';

export default function POSectionStrip({ sections, phone }: { sections: Section[]; phone: boolean }) {
  if (!sections.length) return null;
  const jump = (key: string) => document.getElementById(`${phone ? 'po-psec' : 'po-sec'}-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const withVendor = unitsText(pendingOf(sections.flatMap(s => s.rows).filter(r => r.po.status === 'sent' || r.po.status === 'partially_received')));
  if (phone) {
    return (
      <div style={{ display: 'flex', border: `1px solid ${T.bd}`, borderRadius: 8, background: 'rgba(255,255,255,0.02)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 4 }}>
        {sections.map((s, i) => (
          <button key={s.key} type="button" onClick={() => jump(s.key)} style={{ flex: `1 0 ${sections.length > 4 ? 104 : 0}px`, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, padding: '8px 10px 9px', minHeight: 52, border: 'none', borderLeft: i ? `1px solid ${T.bd}` : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <b style={{ fontFamily: T.mono, fontSize: 16, lineHeight: 1.25, color: SECTION_META[s.key].color }}>{s.rows.length}</b>
            <span style={{ fontSize: 11, color: T.tx3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{SECTION_META[s.key].short}</span>
          </button>
        ))}
      </div>
    );
  }
  const seg: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', fontSize: 12, color: T.tx2, whiteSpace: 'nowrap', border: 'none', background: 'transparent', height: '100%' };
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 36, minWidth: 0, maxWidth: '100%', border: `1px solid ${T.bd}`, borderRadius: 8, background: 'rgba(255,255,255,0.02)', overflowX: 'auto', overflowY: 'hidden' }}>
      {sections.map((s, i) => (
        <button key={s.key} type="button" className="po-seg" onClick={() => jump(s.key)} style={{ ...seg, borderLeft: i ? `1px solid ${T.bd}` : 'none', cursor: 'pointer' }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: SECTION_META[s.key].color }} />
          <b style={{ fontFamily: T.mono, fontSize: 13, color: SECTION_META[s.key].color }}>{s.rows.length}</b>{SECTION_META[s.key].short}
        </button>
      ))}
      {withVendor && <span style={{ ...seg, borderLeft: `1px solid ${T.bd}`, color: T.tx3 }}><b style={{ fontFamily: T.mono, fontSize: 13, color: T.tx }}>{withVendor}</b>still with vendors</span>}
    </div>
  );
}
