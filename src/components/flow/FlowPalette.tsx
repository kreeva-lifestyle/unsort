// The steps you can add to a Flow canvas, grouped Buy → Make → Finish →
// Store. Tap one and it lands to the right of the last step; drag it after.
// On a phone the groups become one scrolling row (index.css .flow-palette).
import { T, S } from '../../lib/theme';
import { PALETTE, KINDS, tint } from './flowModel';
import type { FlowKind } from '../../types/flow';

export default function FlowPalette({ onAdd, busy }: { onAdd: (kind: FlowKind, label: string) => void; busy: boolean }) {
  return (
    <aside className="flow-palette" aria-label="Steps you can add" style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.6 : 1 }}>
      {PALETTE.map(g => (
        <div key={g.group} className="flow-palette-group" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...S.fLabel, marginBottom: 0, fontSize: 10, letterSpacing: '0.1em' }}>{g.group}</span>
          {g.items.map(it => {
            const k = KINDS[it.kind];
            return (
              <button key={it.label} type="button" onClick={() => onAdd(it.kind, it.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '6px 8px', borderRadius: 8, border: `1px solid ${T.bd}`, background: T.glass2, color: T.tx, fontSize: 12, fontWeight: 500, fontFamily: T.sans, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
                <span aria-hidden="true" style={{ minWidth: 18, height: 18, padding: '0 3px', boxSizing: 'border-box', borderRadius: 5, background: tint(k.color, 0.14), color: k.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{k.icon}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                <span aria-hidden="true" style={{ color: T.tx3 }}>+</span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
