// The purchase order's pipeline rail (Motion Lab 06): Draft → Approved →
// Sent → Received as four stops on one rail. When the order moves on, a
// point of light travels to the next stop, the rail fills behind it and
// the stop settles with one pulse. "Sent" is optional in this process, so
// a stop the order skipped shows hollow instead of pretending; a partial
// receipt fills the last stop like a pie; a cancelled order gets a red cap
// where it stopped and the rest of the rail dims. `mini` is the list's
// silent version: stops and fill only, no labels, no travel.
import { useLayoutEffect, useRef } from 'react';
import { T, alpha } from '../../lib/theme';
import { animate, E, reducedMotion } from '../../lib/motion';
import type { PurchaseOrder, PurchaseOrderItem, AuditLog } from '../../types/database';

export type RailStage = 0 | 1 | 2 | 3;
export interface RailState { stage: RailStage; partial: number | null; skippedSent: boolean; cancelled: boolean; closed: boolean }
const P = [0, 1 / 3, 2 / 3, 1];
const LABELS = ['Draft', 'Approved', 'Sent', 'Received'];

/** Where an order stands, from its header, its lines and (when loaded) its
 *  trail. The trail decides "Sent was skipped" only when it covers the
 *  order's whole life (a CREATE row) and still has no SENT row. */
export function railState(po: Pick<PurchaseOrder, 'status' | 'approved_at'>, items: Pick<PurchaseOrderItem, 'quantity' | 'received_qty'>[], audit: AuditLog[] | null | 'error'): RailState {
  const ordered = items.reduce((t, it) => t + Number(it.quantity || 0), 0);
  const got = items.reduce((t, it) => t + Math.min(Number(it.received_qty || 0), Number(it.quantity || 0)), 0);
  const share = ordered > 0 ? got / ordered : 0, received = got > 0;
  const trail = Array.isArray(audit) ? audit : null;
  const sent = trail ? trail.some(a => a.action === 'SENT') : null;
  const skipped = !!trail && trail.some(a => a.action === 'CREATE') && !sent;
  const none = { partial: null, skippedSent: false, cancelled: false, closed: false };
  switch (po.status) {
    case 'draft': return { stage: 0, ...none };
    case 'approved': return { stage: 1, ...none };
    case 'sent': return { stage: 2, ...none };
    case 'cancelled': return { ...none, stage: received ? 3 : sent ? 2 : po.approved_at ? 1 : 0, partial: received && share < 1 ? share : null, cancelled: true };
    default: return { stage: 3, partial: po.status === 'completed' ? null : share, skippedSent: skipped, cancelled: false, closed: po.status === 'closed' };
  }
}

export default function PORail({ state, dates, mini }: { state: RailState; /** One short date per stop, where known. */ dates?: (string | null)[]; mini?: boolean }) {
  const rail = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), light = useRef<HTMLDivElement>(null), cap = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const prev = useRef<RailState | null>(null);
  const color = state.cancelled ? T.re : state.partial != null ? T.yl : state.stage === 3 ? T.gr : state.stage === 2 ? T.bl : T.ac2;

  useLayoutEffect(() => {
    const before = prev.current; prev.current = state;
    const f = fill.current, r = rail.current;
    if (!f || !r) return;
    const p1 = P[state.stage];
    f.style.transform = `scaleX(${p1})`;
    if (mini || !before) return;                                   // first paint: already there
    const moved = before.stage !== state.stage, changed = moved || before.partial !== state.partial || before.cancelled !== state.cancelled;
    if (!changed) return;
    const settle = (i: number) => {
      const n = nodes.current[i]; if (!n) return;
      animate(n.querySelector('.pulse'), [{ opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.3)' }], { duration: 450, easing: E.out });
      animate(n.querySelector('.o'), [{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 320, easing: E.spring });
    };
    if (state.cancelled && !before.cancelled) animate(cap.current, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 320, easing: E.spring });
    if (state.stage > before.stage) {
      const p0 = P[before.stage], W = r.clientWidth;
      const travel = animate(f, [{ transform: `scaleX(${p0})` }, { transform: `scaleX(${p1})` }], { duration: 480, easing: E.emph });
      if (!reducedMotion()) animate(light.current, [{ transform: `translateX(${p0 * W}px)`, opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .82 }, { transform: `translateX(${p1 * W}px)`, opacity: 0 }], { duration: 480, easing: E.emph });
      travel.finished.then(() => settle(state.stage));
    } else settle(state.stage);
  }, [state, mini]);

  const cls = (i: number) => {
    if (state.cancelled && i === state.stage) return 'po-node x';
    if (i === 2 && state.skippedSent) return 'po-node skip';
    if (i === 3 && state.partial != null && state.stage === 3) return 'po-node part';
    if (i < state.stage) return 'po-node done';
    if (i === state.stage) return 'po-node cur';
    return 'po-node';
  };
  const pct = state.partial != null ? Math.round(state.partial * 100) : null;
  const under = (i: number) => mini ? null
    : i === 3 && pct != null ? `${pct}%${state.closed ? ' · closed' : ''}`
    : i === 3 && state.closed ? 'closed' : dates?.[i] ?? null;
  // Stops already passed stay in the rail's own indigo; only the stop the
  // order is at wears the stage colour (blue for sent, yellow partial, green
  // received, red cancelled), so the eye lands on where it is now.
  const nodeVars = (i: number) => { const c = i < state.stage ? T.ac2 : color; return { left: `${P[i] * 100}%`, '--nc': c, '--nc-soft': alpha(c, .16), '--nc-glow': alpha(c, .45) } as React.CSSProperties; };
  const vars = { '--rc': color, '--cxp': `${P[state.stage] * 100}%` } as React.CSSProperties;
  return (
    <div ref={rail} className={`po-rail${mini ? ' po-rail-mini' : ''}${state.cancelled ? ' cx' : ''}`} style={vars} role="img" aria-label={`${LABELS[state.stage]}${state.cancelled ? ', cancelled' : ''}${pct != null ? `, ${pct}% received` : ''}`}>
      <div className="base" /><div ref={fill} className="fill" />
      {LABELS.map((l, i) => (
        <div key={l} ref={el => { nodes.current[i] = el; }} className={cls(i)} style={nodeVars(i)}>
          <div className="o" style={i === 3 && pct != null && !state.cancelled ? { background: `conic-gradient(${T.yl} 0 ${pct}%, ${T.s} ${pct}% 100%)` } : undefined}><b className="pulse" /></div>
          {!mini && <span>{l}{under(i) && <small>{under(i)}</small>}</span>}
        </div>
      ))}
      <div ref={cap} className="cap" style={{ left: `${P[state.stage] * 100}%`, transform: state.cancelled ? 'scaleY(1)' : 'scaleY(0)' }} />
      <div ref={light} className="light" />
    </div>
  );
}
