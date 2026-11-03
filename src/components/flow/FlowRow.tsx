// One pipeline in the Flow list: number, name, SKU, pieces, status, due, and
// its steps left → right as a chain — done ticked, the current one lit,
// late ones red — with a "Next:" line. Tap to open the canvas.
import { T } from '../../lib/theme';
import { KINDS, STEP_STATUS, PIPE_STATUS, tint, fmtDay, isLate, qtyText } from './flowModel';
import type { PipelineRow } from './flowData';

export function nextLine(p: PipelineRow): string {
  const steps = [...p.flow_steps].sort((a, b) => a.x - b.x || a.y - b.y);
  const stuck = steps.find(s => s.status === 'blocked');
  if (stuck) return `${stuck.title || KINDS[stuck.kind].label} is stuck${stuck.notes ? ` — ${stuck.notes}` : ''}`;
  const now = steps.filter(s => s.status === 'active');
  if (now.length) return now.map(s => `${s.assignee || s.title || KINDS[s.kind].label}${qtyText(s) ? ` ${qtyText(s)}` : ''}`).join(' · ');
  const first = steps.find(s => s.status === 'planned');
  return first ? `Waiting to start: ${first.title || KINDS[first.kind].label}${first.assignee ? ` (${first.assignee})` : ''}` : steps.length ? 'All steps done' : 'No steps yet — open to build it';
}

export default function FlowRow({ p, onOpen }: { p: PipelineRow; onOpen: () => void }) {
  const steps = [...p.flow_steps].sort((a, b) => a.x - b.x || a.y - b.y);
  const late = isLate(p.due_date, p.status === 'done' || p.status === 'cancelled') || steps.some(s => isLate(s.due_date, s.status === 'done'));
  const ps = PIPE_STATUS[p.status];
  const pill = late ? T.re : ps.color;
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', textAlign: 'left', background: T.glass1, border: `1px solid ${late ? tint(T.re, 0.25) : T.bd}`, borderRadius: 10, padding: '12px 14px', color: T.tx, cursor: 'pointer', fontFamily: T.sans }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3 }}>F-{p.flow_number}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.title}{(p.sku || p.pieces) && <span style={{ color: T.tx2, fontWeight: 400 }}> · {[p.sku, p.pieces ? `${p.pieces} pcs` : null].filter(Boolean).join(' · ')}</span>}</span>
        </span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: tint(pill, 0.1), color: pill, border: `1px solid ${tint(pill, 0.25)}`, fontSize: 11, fontWeight: 500 }}>{late ? `Late · ${ps.label}` : ps.label}</span>
          {p.due_date && <span style={{ fontSize: 11, color: late ? T.re : T.tx3 }}>due {fmtDay(p.due_date)}</span>}
        </span>
      </span>
      {steps.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', width: '100%', paddingBottom: 2 }}>
          {steps.map((s, i) => {
            const k = KINDS[s.kind];
            const lt = isLate(s.due_date, s.status === 'done');
            const c = s.status === 'done' ? T.gr : lt || s.status === 'blocked' ? T.re : s.status === 'active' ? k.color : T.tx3;
            const lit = s.status !== 'planned' || lt;
            return (
              <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                {i > 0 && <span style={{ width: 18, height: 2, background: steps[i - 1].status === 'done' ? T.gr : T.bd2 }} />}
                <span title={STEP_STATUS[s.status].label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, border: `1px solid ${lit ? tint(c, 0.35) : T.bd2}`, background: lit ? tint(c, 0.1) : 'transparent', color: c, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.85 }}>{s.status === 'done' ? '✓' : k.icon}</span>
                  {s.assignee || s.title || k.label}
                  {qtyText(s) && <span style={{ fontFamily: T.mono, fontWeight: 400, opacity: 0.8 }}>{qtyText(s)}</span>}
                </span>
              </span>
            );
          })}
        </span>
      )}
      <span style={{ fontSize: 11, color: T.tx3 }}>Next: <span style={{ color: T.tx2 }}>{nextLine(p)}</span></span>
    </button>
  );
}
