// The cost-cutting suggestions card. Nudges only — nothing is applied.
import { T } from '../../../lib/theme';
import { money } from '../costing/costingModel';
import type { Suggestion } from './suggestions';

const COLOR: Record<Suggestion['kind'], string> = { supplier: T.gr, driver: T.ac2, fabric: T.bl, price: T.yl, stitching: T.yl, maintenance: T.tx2, gst: T.re };

export default function SuggestionsList({ items }: { items: Suggestion[] }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.tx, marginBottom: 8 }}>Cost-cutting suggestions</div>
      {items.length === 0 && <div style={{ fontSize: 11, color: T.tx3 }}>Nothing to suggest yet — add supplier alternates on the costing sheet, set a threshold, or enter a price.</div>}
      {items.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR[s.kind], marginTop: 5, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{s.title}</span>
              {s.savingPerPc ? <span style={{ fontFamily: T.mono, color: T.gr, fontSize: 11, flexShrink: 0 }}>−{money(s.savingPerPc)}/pc</span> : null}
            </div>
            <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 2 }}>{s.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
