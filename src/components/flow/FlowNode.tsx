// One step on the Flow canvas: kind, link (PO / job work), title, who, status,
// quantity bar. The right-hand dot starts a connection; the card body drags.
import type { PointerEvent as RPE } from 'react';
import { T } from '../../lib/theme';
import { KINDS, STEP_STATUS, NODE_W, NODE_H, qtyText, pct, tint, fmtDay, isLate } from './flowModel';
import type { FlowStep } from '../../types/flow';
import type { LinkInfo } from './flowData';

export default function FlowNode({ step, x, y, link, selected, target, onBodyDown, onPortDown }: {
  step: FlowStep;
  x: number;
  y: number;
  link: LinkInfo | null;
  selected: boolean;
  /** Highlight while choosing where a connection goes. */
  target: boolean;
  onBodyDown: (e: RPE<HTMLDivElement>) => void;
  onPortDown: (e: RPE<HTMLSpanElement>) => void;
}) {
  const k = KINDS[step.kind];
  const st = STEP_STATUS[step.status];
  const late = isLate(step.due_date, step.status === 'done');
  const color = late && step.status !== 'done' ? T.re : st.color;
  const ref = link?.label.replace('Job work ', 'JW ') ?? '';
  return (
    <div data-step={step.id} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${k.label}: ${step.title || k.label}`}
      onPointerDown={onBodyDown}
      style={{ position: 'absolute', left: x, top: y, width: NODE_W, height: NODE_H, boxSizing: 'border-box', padding: 10, borderRadius: 10,
        border: `1px solid ${selected ? T.ac2 : target ? T.gr : T.bd2}`, background: T.s, color: T.tx, cursor: 'grab', touchAction: 'none', userSelect: 'none',
        boxShadow: selected ? `0 0 0 3px ${tint(T.ac, 0.25)}` : '0 4px 14px oklch(0 0 0 / 0.35)', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: k.color }}>
          <span aria-hidden="true" style={{ minWidth: 16, height: 16, padding: '0 3px', boxSizing: 'border-box', borderRadius: 4, background: tint(k.color, 0.14), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{k.icon}</span>
          {k.label}
        </span>
        <span style={{ fontSize: 10, fontFamily: T.mono, color: T.tx3, whiteSpace: 'nowrap' }}>{ref}</span>
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.title || k.label}</span>
      <span style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {step.assignee || link?.sub || 'Not assigned'}{step.due_date ? ` · ${fmtDay(step.due_date)}` : ''}
      </span>
      <span style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />{late && step.status !== 'done' ? 'Late' : st.label}
          </span>
          <span style={{ fontFamily: T.mono, color: T.tx2 }}>{qtyText(step)}</span>
        </span>
        <span style={{ height: 3, borderRadius: 2, background: T.bd2, overflow: 'hidden', display: 'block' }}>
          <span style={{ display: 'block', height: 3, width: `${pct(step)}%`, background: color }} />
        </span>
      </span>
      {step.kind !== 'po' && <span aria-hidden="true" style={{ position: 'absolute', left: -5, top: NODE_H / 2 - 5, width: 9, height: 9, borderRadius: 5, background: T.s3, border: `1px solid ${T.bd2}` }} />}
      {step.kind !== 'stock' && (
        <span role="button" aria-label="Connect to the next step" onPointerDown={onPortDown}
          style={{ position: 'absolute', right: -14, top: NODE_H / 2 - 14, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'crosshair', touchAction: 'none' }}>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: k.color, boxShadow: `0 0 0 3px ${tint(k.color, 0.2)}` }} />
        </span>
      )}
    </div>
  );
}
