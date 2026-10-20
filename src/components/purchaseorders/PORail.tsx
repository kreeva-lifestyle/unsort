// The purchase order's pipeline rail (Motion Lab 06): Draft → Approved →
// Sent → Received as four stops on one rail. When the order moves on, a
// point of light travels to the next stop (480 ms, --e-emph) and the rail
// fills behind it; the new stop, the pill and the caption change only when
// the light lands, and the stop settles with one pulse. "Sent" is optional
// in this process, so a stop the order skipped turns hollow as the light
// passes it; a partial receipt fills the last stop like a pie; an order
// that stopped (cancelled, or closed short) gets a cap where it stopped and
// the rest of the rail dims — it never "moves on". Reached stops stay the
// rail's indigo; the stage colour is the fill's far end and the pulse.
// `mini` is the list's silent version: stops and fill only, no labels.
import { useLayoutEffect, useRef, useState } from 'react';
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
export const TRAVEL_MS = 480;

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

/** True when going from `a` to `b` sends the light along the rail: the
 *  order moved forward and did not stop. The trail landing only repositions,
 *  and under Reduce Motion everything lands at once. */
export function travels(a: RailState, b: RailState): boolean {
  return !b.stopped && b.stage > a.stage && !(!a.ready && b.ready) && !reducedMotion();
}
const keyOf = (s: RailState) => `${s.stage}|${s.partial}|${s.skippedSent}|${s.stopped}|${s.ready}`;
/** The fill's far end: the stage the order reached, whether or not it stopped there. */
const stageColor = (s: RailState) => (s.partial != null ? T.yl : s.stage === 3 ? T.gr : s.stage === 2 ? T.bl : T.ac2);
const capped = (s: RailState) => s.stopped === 'cancelled' || (s.stopped === 'closed' && s.stage < 3);

export default function PORail({ state, qty, mini, onLanded }: { state: RailState; /** Under the last stop: "12 / 20" (the card supplies it); the share otherwise. */ qty?: string | null; mini?: boolean; /** Called once the stops show `state` — after the light lands, or at once when nothing travels. */ onLanded?: () => void }) {
  const rail = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), light = useRef<HTMLDivElement>(null), cap = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const prev = useRef<RailState | null>(null), latest = useRef(state), landed = useRef(onLanded);
  const flight = useRef(0), flying = useRef(false);
  latest.current = state; landed.current = onLanded;
  // What the stops show: the state the light last landed on. While it
  // travels, the stop it left is already "done" and Sent turns hollow as the
  // light passes it.
  const [shown, setShown] = useState(state);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [skipNow, setSkipNow] = useState(false);
  const key = keyOf(state);

  useLayoutEffect(() => {
    const before = prev.current; prev.current = state;
    const f = fill.current, r = rail.current;
    if (f) f.style.transform = `scaleX(${P[state.stage]})`;
    const settle = (s: RailState) => {
      const n = nodes.current[s.stage]; if (!n) return;
      animate(n.querySelector('.pulse'), [{ opacity: .8, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.3)' }], { duration: 450, easing: E.out });
      animate(n.querySelector('.o'), [{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 320, easing: E.spring });
    };
    const land = () => { setShown(latest.current); setLeaving(null); setSkipNow(false); };
    if (mini || !before || !f || !r) { land(); landed.current?.(); return; }
    if (flying.current) return;                                    // a change mid-flight (the trail landing) is adopted when the light lands
    // The cap grows in whenever it becomes visible — also when an already
    // closed order is cancelled, or loses its last receipt.
    if (capped(state) && !capped(before)) animate(cap.current, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 320, easing: E.spring });
    if (!travels(before, state)) {
      land();
      const moved = before.stage !== state.stage || before.partial !== state.partial || before.stopped !== state.stopped;
      // A stop that newly stopped gets its cap instead of a pulse.
      if (moved && !(!before.ready && state.ready) && !(state.stopped && !before.stopped)) settle(state);
      landed.current?.();
      return;
    }
    const id = ++flight.current; flying.current = true;
    const p0 = P[before.stage], p1 = P[state.stage], W = r.clientWidth;
    setLeaving(before.stage);
    animate(f, [{ transform: `scaleX(${p0})` }, { transform: `scaleX(${p1})` }], { duration: TRAVEL_MS, easing: E.emph });
    const trip = animate(light.current, [{ transform: `translateX(${p0 * W}px)`, opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .82 }, { transform: `translateX(${p1 * W}px)`, opacity: 0 }], { duration: TRAVEL_MS, easing: E.emph });
    const skip = state.skippedSent && !before.skippedSent ? window.setTimeout(() => { if (flight.current === id) setSkipNow(true); }, TRAVEL_MS * .45) : 0;
    trip.finished.then(() => {
      window.clearTimeout(skip);
      if (flight.current !== id) return;
      flying.current = false;
      land(); settle(latest.current); landed.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the state's value; a new object with the same value is no change
  }, [key, mini]);

  const v = shown;
  const cls = (i: number) => {
    if (leaving === i) return 'po-node done';
    if (v.stopped === 'cancelled' && i === v.stage) return 'po-node x';
    if (v.stopped === 'closed' && i === v.stage && v.stage < 3) return 'po-node stop';
    if (i === 2 && (v.skippedSent || skipNow)) return 'po-node skip';
    if (i === 3 && v.partial != null && v.stage === 3) return 'po-node part';
    if (i < v.stage) return 'po-node done';
    if (i === v.stage) return 'po-node cur';
    return 'po-node';
  };
  const pct = v.partial != null ? Math.round(v.partial * 100) : null;
  const under = (i: number) => mini ? null
    : i === 3 && (qty || pct != null) ? qty ?? `${pct}%`       // one short line: the pill and the caption already say "closed"
    : v.stopped === 'closed' && i === v.stage ? 'closed' : null;
  const ac = { '--nc': T.ac2, '--nc-soft': alpha(T.ac2, .16), '--nc-glow': alpha(T.ac2, .45) } as React.CSSProperties;
  const capColor = state.stopped === 'cancelled' ? T.re : T.tx3;
  const vars = { '--rc': stageColor(state), '--pc': stageColor(v), '--cxp': `${P[state.stage] * 100}%`, '--cap': capColor, '--cap-glow': alpha(capColor, .6) } as React.CSSProperties;
  const label = `${LABELS[state.stage]}${state.stopped ? `, ${state.stopped}` : ''}${state.partial != null ? `, ${Math.round(state.partial * 100)}% received` : ''}${state.skippedSent ? ', Sent skipped' : ''}`;
  return (
    <div ref={rail} className={`po-rail${mini ? ' po-rail-mini' : ''}${state.stopped ? ' cx' : ''}`} style={vars} role="img" aria-label={label}>
      <div className="base" /><div ref={fill} className="fill" />
      {LABELS.map((l, i) => (
        <div key={l} ref={el => { nodes.current[i] = el; }} className={cls(i)} style={{ left: `${P[i] * 100}%`, ...ac }}>
          <div className="o" style={i === 3 && pct != null && v.stage === 3 && v.stopped !== 'cancelled' ? { background: `conic-gradient(${T.yl} 0 ${pct}%, ${T.s} ${pct}% 100%)` } : undefined}><b className="pulse" /></div>
          {!mini && <span>{l}{under(i) && <small>{under(i)}</small>}</span>}
        </div>
      ))}
      <div ref={cap} className="cap" style={{ left: `${P[state.stage] * 100}%`, transform: capped(state) ? 'scaleY(1)' : 'scaleY(0)' }} />
      <div ref={light} className="light" />
    </div>
  );
}
