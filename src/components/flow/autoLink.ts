// Put the purchase orders and job work found for a SKU onto a pipeline, so
// nobody links them by hand. Each order fills the first empty step of its kind
// (a fabric PO prefers a step called "Fabric…", job work prefers a step named
// like its job type); when there is no empty step left it gets a new one under
// the last step of that kind, joined the same way that step is joined.
// Each order is one or two single-row writes; if one fails the rest still go
// and the caller is told, so the canvas never silently misses a link.
import { loadPipeline, updateStep, insertStep, addEdge } from './flowData';
import { NODE_H, NODE_W, freeSpot, snap } from './flowModel';
import type { FlowStep, FlowStepStatus } from '../../types/flow';
import type { SkuOrder } from './skuFinds';

const linkOf = (s: FlowStep) => s.po_id || s.jobwork_order_id;

function pickStep(o: SkuOrder, steps: FlowStep[]): FlowStep | undefined {
  const free = steps.filter(s => s.kind === o.kind && !linkOf(s));
  if (o.kind === 'po') {
    const fabric = o.what === 'fabric';
    return free.find(s => /fabric/i.test(s.title) === fabric) ?? free[0];
  }
  const w = o.what.toLowerCase();
  return free.find(s => s.title.toLowerCase().includes(w)) ?? free[0];
}

function fieldsFor(o: SkuOrder): Partial<FlowStep> {
  const base = { assignee: o.vendor, status: (o.open ? 'active' : 'done') as FlowStepStatus, due_date: o.due, unit: o.unit, qty_planned: o.qty };
  return o.kind === 'po'
    ? { ...base, po_id: o.id }
    : { ...base, jobwork_order_id: o.id, title: o.sku ? `${o.what} · ${o.sku}` : o.what };
}

// Below the lowest step of the same kind, moved down past anything already there.
function spotUnder(sib: FlowStep, steps: FlowStep[]) {
  let y = snap(sib.y + NODE_H + 40);
  const hit = (yy: number) => steps.some(s => Math.abs(s.x - sib.x) < NODE_W && Math.abs(s.y - yy) < NODE_H + 20);
  while (hit(y)) y += NODE_H + 40;
  return { x: sib.x, y };
}

export async function linkOrders(pipelineId: string, orders: SkuOrder[]): Promise<{ linked: number; failed: unknown }> {
  const { steps, edges } = await loadPipeline(pipelineId);
  const all = [...steps];
  const allEdges = [...edges];
  const done = new Set(all.map(linkOf).filter(Boolean));
  let linked = 0;
  let failed: unknown = null;
  for (const o of orders) {
    if (done.has(o.id)) continue;
    try {
      const f = fieldsFor(o);
      const target = pickStep(o, all);
      if (target) {
        await updateStep(target.id, f);
        Object.assign(target, f);
      } else {
        const sib = all.filter(s => s.kind === o.kind).sort((a, b) => b.y - a.y)[0];
        const at = sib ? spotUnder(sib, all) : freeSpot(all);
        const title = o.kind === 'po' ? (o.what === 'fabric' ? 'Fabric PO' : 'Material PO') : f.title;
        const s = await insertStep({ pipeline_id: pipelineId, kind: o.kind, x: at.x, y: at.y, ...f, title: title || '' });
        all.push(s);
        if (sib) {
          for (const e of allEdges.filter(e => e.from_step === sib.id || e.to_step === sib.id)) {
            const from = e.from_step === sib.id ? s.id : e.from_step;
            const to = e.to_step === sib.id ? s.id : e.to_step;
            allEdges.push(await addEdge(pipelineId, from, to));
          }
        }
      }
      done.add(o.id);
      linked++;
    } catch (e) { failed = e; }
  }
  return { linked, failed };
}
