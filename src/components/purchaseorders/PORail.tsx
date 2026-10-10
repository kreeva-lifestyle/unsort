// The purchase order's pipeline rail (Motion Lab 06): Draft → Approved →
// Sent → Received as four stops on one rail. When the order moves on, a
// point of light travels to the next stop, the rail fills behind it and
// the stop settles with one pulse. "Sent" is optional in this process, so
// a stop the order skipped shows hollow instead of pretending; a partial
// receipt fills the last stop like a pie; an order that stopped (cancelled,
// or closed short) gets a cap where it stopped and the rest of the rail
// dims — it never "moves on". `mini` is the list's silent version: stops
// and fill only, no labels, no travel.
import { useLayoutEffect, useRef } from 'react';
import { T, alpha } from '../../lib/theme';
import { animate, E, reducedMotion } from '../../lib/motion';
import type { PurchaseOrder, PurchaseOrderItem, AuditLog } from '../../types/database';

export type RailStage = 0 | 1 | 2 | 3;
export interface RailState {
  stage: RailStage; partial: number | null; skippedSent: boolean;
  stopped: 'cancelled' | 'closed' | null;
  /** The trail was loaded when this was computed — a state without it may be repositioned once it lands. */
  ready: boolean;
}
const P = [0, 1 / 3, 2 / 3, 1];
const LABELS = ['Draft', 'Approved', 'Sent', 'Received'];

/** Where an order stands, from its header, its lines and (when loaded) its
 *  trail. The trail places a stopped order that had been sent, and decides
 *  "Sent was skipped" only when it covers the order's whole life (a CREATE
 *  row), has no SENT row, and the order did reach Received. */
export function railState(po: Pick<PurchaseOrder, 'status' | 'approved_at'>, items: Pick<PurchaseOrderItem, 'quantity' | 'received_qty'>[], audit: AuditLog[] | null | 'error'): RailState {
  const ordered = items.reduce((t, it) => t + Number(it.quantity || 0), 0);
  const got = items.reduce((t, it) => t + Math.min(Number(it.received_qty || 0), Number(it.quantity || 0)), 0);
  const share = ordered > 0 ? got / ordered : 0, received = got > 0;
  const trail = Array.isArray(audit) ? audit : null, ready = !!trail;
  const sent = trail ? trail.some(a => a.action === 'SENT') : null;
  const skipped = !!trail && trail.some(a => a.action === 'CREATE') && !sent;
  const base = { partial: null as number | null, skippedSent: false, stopped: null as RailState['stopped'], ready };
  switch (po.status) {
    case 'draft': return { ...base, stage: 0 };
    case 'approved': return { ...base, stage: 1 };
    case 'sent': return { ...base, stage: 2 };
    case 'cancelled': case 'closed': {
      const stage: RailStage = received ? 3 : sent ? 2 : po.approved_at ? 1 : 0;
      return { ...base, stage, partial: received && share < 1 ? share : null, skippedSent: skipped && stage === 3, stopped: po.status };
    }
    default: return { ...base, stage: 3, partial: po.status === 'completed' ? null : share, skippedSent: skipped };
  }
}

export default function PORail({ state, dates, qty, mini }: { state: RailState; /** One short date per stop, where known. */ dates?: (string | null)[]; /** Under the last stop: "12 / 20" (the card supplies it); the share otherwise. */ qty?: string | null; mini?: boolean }) {
  const rail = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), light = useRef<HTMLDivElement>(null), cap = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const prev = useRef<RailState | null>(null);
  const color = state.stopped === 'cancelled' ? T.re : state.stopped === 'closed' && state.stage < 3 ? T.tx3
    : state.partial != null ? T.yl : state.stage === 3 ? T.gr : state.stage === 2 ? T.bl : T.ac2;
  const showCap = state.stopped === 'cancelled' || (state.stopped === 'closed' && state.stage < 3);

  useLayoutEffect(() => {
    const before = prev.current; prev.current = state;
    const f = fill.current, r = rail.current;
    if (!f || !r) return;
    const p1 = P[state.stage];
    f.style.transform = `scaleX(${p1})`;
    if (mini || !before) return;                                   // first paint: already there
    const changed = before.stage !== state.stage || before.partial !== state.partial || before.stopped !== state.stopped;
    if (!changed) return;
    if (!before.ready && state.ready) return;                      // the trail landing only repositions: no travel, no pulse
    const settle = (i: number) => {
      const n = nodes.current[i]; if (!n) return;
      animate(n.querySelector('.pulse'), [{ opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.3)' }], { duration: 450, easing: E.out });
      animate(n.querySelector('.o'), [{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 320, easing: E.spring });
    };
    // The cap grows in whenever it becomes visible — also when an already
    // closed order is cancelled, or loses its last receipt.
    const capBefore = before.stopped === 'cancelled' || (before.stopped === 'closed' && before.stage < 3);
    if (showCap && !capBefore) animate(cap.current, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 320, easing: E.spring });
    if (!state.stopped && state.stage > before.stage) {           // moving on: the light travels
      const p0 = P[before.stage], W = r.clientWidth;
      const travel = animate(f, [{ transform: `scaleX(${p0})` }, { transform: `scaleX(${p1})` }], { duration: 480, easing: E.emph });
      if (!reducedMotion()) animate(light.current, [{ transform: `translateX(${p0 * W}px)`, opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .82 }, { transform: `translateX(${p1 * W}px)`, opacity: 0 }], { duration: 480, easing: E.emph });
      travel.finished.then(() => settle(state.stage));
    } else settle(state.stage);
  }, [state, mini, showCap]);

  const cls = (i: number) => {
    if (state.stopped === 'cancelled' && i === state.stage) return 'po-node x';
    if (state.stopped === 'closed' && i === state.stage && state.stage < 3) return 'po-node stop';
    if (i === 2 && state.skippedSent) return 'po-node skip';
    if (i === 3 && state.partial != null && state.stage === 3) return 'po-node part';
    if (i < state.stage) return 'po-node done';
    if (i === state.stage) return 'po-node cur';
    return 'po-node';
  };
  const pct = state.partial != null ? Math.round(state.partial * 100) : null;
  const under = (i: number) => mini ? null
    : i === 3 && (qty || pct != null) ? `${qty ?? `${pct}%`}${state.stopped === 'closed' ? ' · closed' : ''}`
    : state.stopped === 'closed' && i === state.stage ? 'closed' : dates?.[i] ?? null;
  // Stops already passed stay in the rail's own indigo; only the stop the
  // order is at wears the stage colour, so the eye lands on where it is now.
  const nodeVars = (i: number) => { const c = i < state.stage ? T.ac2 : color; return { left: `${P[i] * 100}%`, '--nc': c, '--nc-soft': alpha(c, .16), '--nc-glow': alpha(c, .45) } as React.CSSProperties; };
  const vars = { '--rc': color, '--cxp': `${P[state.stage] * 100}%`, '--cap': color, '--cap-glow': alpha(color, .6) } as React.CSSProperties;
  const label = `${LABELS[state.stage]}${state.stopped ? `, ${state.stopped}` : ''}${pct != null ? `, ${pct}% received` : ''}${state.skippedSent ? ', Sent skipped' : ''}`;
  return (
    <div ref={rail} className={`po-rail${mini ? ' po-rail-mini' : ''}${state.stopped ? ' cx' : ''}`} style={vars} role="img" aria-label={label}>
      <div className="base" /><div ref={fill} className="fill" />
      {LABELS.map((l, i) => (
        <div key={l} ref={el => { nodes.current[i] = el; }} className={cls(i)} style={nodeVars(i)}>
          <div className="o" style={i === 3 && pct != null && state.stopped !== 'cancelled' ? { background: `conic-gradient(${T.yl} 0 ${pct}%, ${T.s} ${pct}% 100%)` } : undefined}><b className="pulse" /></div>
          {!mini && <span>{l}{under(i) && <small>{under(i)}</small>}</span>}
        </div>
      ))}
      <div ref={cap} className="cap" style={{ left: `${P[state.stage] * 100}%`, transform: showCap ? 'scaleY(1)' : 'scaleY(0)' }} />
      <div ref={light} className="light" />
    </div>
  );
}
