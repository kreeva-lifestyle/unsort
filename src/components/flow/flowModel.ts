// Flow — what each kind of step looks like, the canvas geometry, and the
// small pure helpers the list, the canvas and the inspector share.
import { T, alpha } from '../../lib/theme';
import type { FlowKind, FlowStep, FlowStepStatus, FlowPipelineStatus } from '../../types/flow';

export const KINDS: Record<FlowKind, { label: string; icon: string; color: string; unit: string }> = {
  po:        { label: 'Purchase order', icon: 'PO', color: T.bl, unit: 'm' },
  cutting:   { label: 'Cutting',        icon: 'C',  color: T.yl, unit: 'pcs' },
  jobwork:   { label: 'Job work',       icon: 'JW', color: T.or, unit: 'pcs' },
  stitching: { label: 'Stitching',      icon: 'S',  color: T.ac2, unit: 'pcs' },
  qc:        { label: 'QC & finish',    icon: 'QC', color: T.gr, unit: 'pcs' },
  packing:   { label: 'Packing',        icon: 'P',  color: T.gr, unit: 'pcs' },
  stock:     { label: 'Ready stock',    icon: 'IN', color: T.gd, unit: 'pcs' },
  other:     { label: 'Other step',     icon: '•',  color: T.tx2, unit: 'pcs' },
};

/** The palette, grouped the way work happens. */
export const PALETTE: { group: string; items: { kind: FlowKind; label: string }[] }[] = [
  { group: 'Buy', items: [{ kind: 'po', label: 'Fabric PO' }, { kind: 'po', label: 'Material PO' }] },
  { group: 'Make', items: [{ kind: 'cutting', label: 'Cutting' }, { kind: 'jobwork', label: 'Job work' }, { kind: 'stitching', label: 'Stitching' }] },
  { group: 'Finish', items: [{ kind: 'qc', label: 'QC & iron' }, { kind: 'packing', label: 'Packing' }] },
  { group: 'Store', items: [{ kind: 'stock', label: 'Ready stock' }, { kind: 'other', label: 'Other step' }] },
];

export const STEP_STATUS: Record<FlowStepStatus, { label: string; color: string }> = {
  planned: { label: 'Planned', color: T.tx3 },
  active:  { label: 'In progress', color: T.ac2 },
  done:    { label: 'Done', color: T.gr },
  blocked: { label: 'Stuck', color: T.re },
};

export const PIPE_STATUS: Record<FlowPipelineStatus, { label: string; color: string }> = {
  planning:  { label: 'Planning', color: T.tx2 },
  running:   { label: 'Running', color: T.ac2 },
  done:      { label: 'Done', color: T.gr },
  cancelled: { label: 'Cancelled', color: T.tx3 },
};

/** Canvas geometry: node size, the plane, and the 20 px snap grid. */
export const NODE_W = 168;
export const NODE_H = 120;
export const GRID = 20;
export const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);
export const outPort = (s: Pick<FlowStep, 'x' | 'y'>) => ({ x: s.x + NODE_W, y: s.y + NODE_H / 2 });
export const inPort = (s: Pick<FlowStep, 'x' | 'y'>) => ({ x: s.x, y: s.y + NODE_H / 2 });
/** A smooth left-to-right connector; loops back (QC → stitching) bow below. */
export function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  if (b.x >= a.x) return `M${a.x} ${a.y} C${a.x + dx} ${a.y},${b.x - dx} ${b.y},${b.x} ${b.y}`;
  const low = Math.max(a.y, b.y) + NODE_H;
  return `M${a.x} ${a.y} C${a.x + 80} ${low},${b.x - 80} ${low},${b.x} ${b.y}`;
}

/** Where a new step lands: right of the right-most step, top row free. */
export function freeSpot(steps: Pick<FlowStep, 'x' | 'y'>[]): { x: number; y: number } {
  if (steps.length === 0) return { x: 20, y: 40 };
  const right = Math.max(...steps.map(s => s.x));
  return { x: snap(right + NODE_W + 60), y: 40 };
}

export const qtyText = (s: Pick<FlowStep, 'qty_done' | 'qty_planned' | 'unit'>) => {
  const n = (v: number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const u = s.unit ? ` ${s.unit}` : '';
  return s.qty_planned ? `${n(s.qty_done)}/${n(s.qty_planned)}${u}` : s.qty_done ? `${n(s.qty_done)}${u}` : '';
};
export const pct = (s: Pick<FlowStep, 'qty_done' | 'qty_planned' | 'status'>) =>
  s.status === 'done' ? 100 : s.qty_planned ? Math.min(100, Math.round((Number(s.qty_done) / Number(s.qty_planned)) * 100)) : 0;

export const tint = (color: string, a = 0.12) => alpha(color, a);
export const fmtDay = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
export const isLate = (d: string | null, done: boolean) => !!d && !done && d < new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
