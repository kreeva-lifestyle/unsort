// The Flow canvas: a dotted plane that scrolls (pan), steps that drag (snap
// to a 20 px grid, saved on release), and connections drawn from a step's
// right-hand dot. Drag the dot onto another step, or — on a phone — tap the
// dot, then tap the step it goes to. Tap a line to select it.
import { useRef, useState, type PointerEvent as RPE } from 'react';
import { T, S } from '../../lib/theme';
import FlowNode from './FlowNode';
import { NODE_W, NODE_H, snap, outPort, inPort, curve } from './flowModel';
import type { FlowStep, FlowEdge } from '../../types/flow';
import type { LinkInfo } from './flowData';

export type Selection = { type: 'step' | 'edge'; id: string } | null;
type Drag = { id: string; dx: number; dy: number; x0: number; y0: number; x: number; y: number; moved: boolean };

export default function FlowBoard({ steps, edges, links, sel, onSelect, onMove, onConnect }: {
  steps: FlowStep[];
  edges: FlowEdge[];
  links: Record<string, LinkInfo>;
  sel: Selection;
  onSelect: (s: Selection) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
}) {
  const plane = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [wire, setWire] = useState<{ from: string; x: number; y: number; moved: boolean } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const pos = (s: FlowStep) => (drag?.id === s.id ? { x: drag.x, y: drag.y } : { x: s.x, y: s.y });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = plane.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const stepAt = (e: { clientX: number; clientY: number }) =>
    (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-step]')?.getAttribute('data-step') ?? null;

  const bodyDown = (s: FlowStep) => (e: RPE<HTMLDivElement>) => {
    if (picking) { if (picking !== s.id) onConnect(picking, s.id); setPicking(null); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setDrag({ id: s.id, dx: p.x - s.x, dy: p.y - s.y, x0: s.x, y0: s.y, x: s.x, y: s.y, moved: false });
  };
  const portDown = (s: FlowStep) => (e: RPE<HTMLSpanElement>) => {
    e.stopPropagation();
    plane.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    setWire({ from: s.id, x: p.x, y: p.y, moved: false });
  };
  const move = (e: RPE<HTMLDivElement>) => {
    if (drag) {
      const p = local(e);
      const x = Math.max(0, p.x - drag.dx), y = Math.max(0, p.y - drag.dy);
      setDrag({ ...drag, x, y, moved: drag.moved || Math.abs(x - drag.x0) + Math.abs(y - drag.y0) > 4 });
    } else if (wire) {
      const p = local(e);
      setWire({ ...wire, x: p.x, y: p.y, moved: wire.moved || Math.abs(p.x - wire.x) + Math.abs(p.y - wire.y) > 6 });
    }
  };
  const up = (e: RPE<HTMLDivElement>) => {
    if (drag) {
      if (drag.moved) onMove(drag.id, snap(drag.x), snap(drag.y)); else onSelect({ type: 'step', id: drag.id });
      setDrag(null);
    } else if (wire) {
      const to = stepAt(e);
      if (wire.moved && to && to !== wire.from) onConnect(wire.from, to);
      else if (!wire.moved) setPicking(wire.from);
      setWire(null);
    }
  };

  const byId = Object.fromEntries(steps.map(s => [s.id, s]));
  const w = Math.max(1100, ...steps.map(s => pos(s).x + NODE_W + 200));
  const h = Math.max(560, ...steps.map(s => pos(s).y + NODE_H + 200));
  const wireFrom = wire ? byId[wire.from] : null;

  return (
    <div style={{ position: 'relative', overflow: 'auto', flex: 1, minHeight: 420, borderRadius: 10, border: `1px solid ${T.bd}`, background: 'oklch(0.10 0.02 265)', WebkitOverflowScrolling: 'touch' }}>
      {picking && (
        <div style={{ position: 'sticky', top: 8, left: 8, zIndex: 3, display: 'inline-flex', gap: 8, alignItems: 'center', margin: 8, padding: '6px 10px', borderRadius: 8, background: T.s2, border: `1px solid ${T.bd2}`, fontSize: 12 }}>
          Tap the step this goes to
          <button type="button" onClick={() => setPicking(null)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28 }}>Cancel</button>
        </div>
      )}
      <div ref={plane} onPointerMove={move} onPointerUp={up} onPointerDown={e => { if (e.target === e.currentTarget) { onSelect(null); setPicking(null); } }}
        style={{ position: 'relative', width: w, height: h, backgroundImage: 'radial-gradient(oklch(1 0 0 / 0.07) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
          {edges.map(ed => {
            const a = byId[ed.from_step], b = byId[ed.to_step];
            if (!a || !b) return null;
            const d = curve(outPort(pos(a)), inPort(pos(b)));
            const on = sel?.type === 'edge' && sel.id === ed.id;
            const live = a.status === 'done' ? T.gr : a.status === 'active' ? T.ac2 : T.tx3;
            return (
              <g key={ed.id}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onPointerDown={e => { e.stopPropagation(); onSelect({ type: 'edge', id: ed.id }); }} />
                <path d={d} fill="none" stroke={on ? T.ac2 : live} strokeWidth={on ? 3 : 2} strokeDasharray={a.status === 'done' ? undefined : '6 4'} />
              </g>
            );
          })}
          {wire && wireFrom && <path d={curve(outPort(pos(wireFrom)), { x: wire.x, y: wire.y })} fill="none" stroke={T.ac2} strokeWidth={2} strokeDasharray="4 4" />}
        </svg>
        {edges.map(ed => {
          const a = byId[ed.from_step], b = byId[ed.to_step];
          if (!a || !b || !ed.label) return null;
          const p = outPort(pos(a)), q = inPort(pos(b));
          return <span key={ed.id} style={{ position: 'absolute', left: (p.x + q.x) / 2, top: (p.y + q.y) / 2, transform: 'translate(-50%, -50%)', padding: '2px 7px', borderRadius: 5, background: T.s2, border: `1px solid ${T.bd2}`, color: T.tx2, fontSize: 10, fontFamily: T.mono, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{ed.label}</span>;
        })}
        {steps.map(s => {
          const p = pos(s);
          const link = (s.po_id && links[s.po_id]) || (s.jobwork_order_id && links[s.jobwork_order_id]) || null;
          return <FlowNode key={s.id} step={s} x={p.x} y={p.y} link={link} selected={sel?.type === 'step' && sel.id === s.id}
            target={!!picking && picking !== s.id} onBodyDown={bodyDown(s)} onPortDown={portDown(s)} />;
        })}
        {steps.length === 0 && (
          <div style={{ position: 'absolute', left: 40, top: 40, color: T.tx3, fontSize: 12, maxWidth: 320, lineHeight: 1.6 }}>
            Empty canvas. Tap a step on the left (Fabric PO, Cutting, Stitching…) to add it, then join them: drag from a step's right-hand dot to the next step.
          </div>
        )}
      </div>
    </div>
  );
}
