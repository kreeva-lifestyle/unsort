// Flow — every read and write the module makes. Plain single-table writes go
// straight to the table (RLS: active staff); making a pipeline from a
// template touches three tables, so it goes through flow_create().
import { supabase } from '../../lib/supabase';
import type { FlowPipeline, FlowStep, FlowEdge, FlowAttachment, FlowTemplate, FlowKind } from '../../types/flow';

export const PIPE_COLS = 'id, flow_number, title, sku, pieces, sizes, costing_product_id, status, due_date, notes, created_by, created_at, updated_at';
export const STEP_COLS = 'id, pipeline_id, kind, title, assignee, po_id, jobwork_order_id, qty_planned, qty_done, unit, status, due_date, notes, x, y, created_at, updated_at';
const EDGE_COLS = 'id, pipeline_id, from_step, to_step, label, created_at';
const FILE_COLS = 'id, pipeline_id, step_id, path, name, type, size, uploaded_by, created_at';

export type PipelineRow = FlowPipeline & { flow_steps: FlowStep[] };
/** What a step linked to a PO / job work shows about it. */
export type LinkInfo = { label: string; sub: string; status: string; got?: number; of?: number; complete?: boolean };

const must = <T,>(r: { data: T | null; error: unknown }): T => { if (r.error) throw r.error; return r.data as T; };

export async function listPipelines(): Promise<PipelineRow[]> {
  return must(await supabase.from('flow_pipelines').select(`${PIPE_COLS}, flow_steps(${STEP_COLS})`)
    .order('created_at', { ascending: false }).limit(300)) as unknown as PipelineRow[];
}

export async function loadPipeline(id: string) {
  const [p, s, e, f] = await Promise.all([
    supabase.from('flow_pipelines').select(PIPE_COLS).eq('id', id).single(),
    supabase.from('flow_steps').select(STEP_COLS).eq('pipeline_id', id).order('x'),
    supabase.from('flow_edges').select(EDGE_COLS).eq('pipeline_id', id),
    supabase.from('flow_attachments').select(FILE_COLS).eq('pipeline_id', id).order('created_at', { ascending: false }),
  ]);
  return { pipeline: must(p) as FlowPipeline, steps: must(s) as FlowStep[], edges: must(e) as FlowEdge[], files: must(f) as FlowAttachment[] };
}

/** PO / job-work details for the steps linked to them (one query each). */
export async function loadLinks(steps: FlowStep[]): Promise<Record<string, LinkInfo>> {
  const poIds = [...new Set(steps.map(s => s.po_id).filter(Boolean))] as string[];
  const jwIds = [...new Set(steps.map(s => s.jobwork_order_id).filter(Boolean))] as string[];
  const out: Record<string, LinkInfo> = {};
  if (poIds.length) {
    const rows = must(await supabase.from('purchase_orders').select('id, po_number, vendor_name, status, purchase_order_items(quantity, received_qty, unit, cancelled_at)').in('id', poIds)) as
      { id: string; po_number: number; vendor_name: string; status: string; purchase_order_items: { quantity: number; received_qty: number; unit: string | null }[] }[];
    for (const r of rows) {
      const of = r.purchase_order_items.reduce((t, i) => t + Number(i.quantity || 0), 0);
      const got = r.purchase_order_items.reduce((t, i) => t + Number(i.received_qty || 0), 0);
      out[r.id] = { label: `PO #${r.po_number}`, sub: r.vendor_name, status: r.status.replace(/_/g, ' '), got, of, complete: ['completed', 'closed'].includes(r.status) };
    }
  }
  if (jwIds.length) {
    // The summary view carries what came back OK, so a linked step's "done" fills itself.
    const rows = must(await supabase.from('jobwork_order_summary').select('id, jw_number, vendor_name, job_type, status, pieces, pcs_ok').in('id', jwIds)) as
      { id: string; jw_number: number; vendor_name: string; job_type: string | null; status: string; pieces: number | null; pcs_ok: number | null }[];
    for (const r of rows) out[r.id] = { label: `Job work #${r.jw_number}`, sub: [r.vendor_name, r.job_type].filter(Boolean).join(' · '), status: r.status, got: Number(r.pcs_ok || 0), of: r.pieces ?? undefined, complete: r.status === 'closed' };
  }
  return out;
}

export async function createPipeline(p: Record<string, unknown>, templateId: string | null): Promise<string> {
  return must(await supabase.rpc('flow_create', { p, p_template: templateId })) as string;
}
export async function updatePipeline(id: string, patch: Partial<FlowPipeline>) {
  must(await supabase.from('flow_pipelines').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
}
export async function deletePipeline(id: string) { must(await supabase.from('flow_pipelines').delete().eq('id', id)); }

export async function addStep(pipelineId: string, kind: FlowKind, title: string, x: number, y: number, unit: string): Promise<FlowStep> {
  return must(await supabase.from('flow_steps').insert({ pipeline_id: pipelineId, kind, title, x, y, unit }).select(STEP_COLS).single()) as FlowStep;
}
/** A step with every field set at once (used when linking orders found for the SKU). */
export async function insertStep(row: Partial<FlowStep> & { pipeline_id: string; kind: FlowKind }): Promise<FlowStep> {
  return must(await supabase.from('flow_steps').insert(row).select(STEP_COLS).single()) as FlowStep;
}
export async function updateStep(id: string, patch: Partial<FlowStep>) {
  must(await supabase.from('flow_steps').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
}
export async function deleteStep(id: string) { must(await supabase.from('flow_steps').delete().eq('id', id)); }

export async function addEdge(pipelineId: string, from: string, to: string): Promise<FlowEdge> {
  return must(await supabase.from('flow_edges').insert({ pipeline_id: pipelineId, from_step: from, to_step: to }).select(EDGE_COLS).single()) as FlowEdge;
}
export async function updateEdge(id: string, label: string | null) { must(await supabase.from('flow_edges').update({ label }).eq('id', id)); }
export async function deleteEdge(id: string) { must(await supabase.from('flow_edges').delete().eq('id', id)); }

export async function listTemplates(): Promise<FlowTemplate[]> {
  return must(await supabase.from('flow_templates').select('id, name, graph, created_by, created_at').order('name')) as FlowTemplate[];
}
/** Save this canvas as a template (same name = replaced). */
export async function saveTemplate(name: string, steps: FlowStep[], edges: FlowEdge[]) {
  const key = Object.fromEntries(steps.map((s, i) => [s.id, `s${i}`]));
  const graph = {
    steps: steps.map(s => ({ key: key[s.id], kind: s.kind, title: s.title, assignee: s.assignee ?? '', unit: s.unit ?? '', x: s.x, y: s.y })),
    edges: edges.map(e => ({ from: key[e.from_step], to: key[e.to_step], label: e.label ?? '' })),
  };
  must(await supabase.from('flow_templates').upsert({ name: name.trim(), graph }, { onConflict: 'name' }));
}

/** Search to link a step: recent open POs / job work matching the text. */
export async function searchPOs(q: string) {
  let r = supabase.from('purchase_orders').select('id, po_number, vendor_name, po_type, status').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20);
  const n = parseInt(q.replace(/\D/g, ''), 10);
  if (q.trim()) r = !isNaN(n) && /^\D*\d+\D*$/.test(q.trim()) ? r.eq('po_number', n) : r.ilike('vendor_name', `%${q.trim().replace(/[%_]/g, '')}%`);
  return must(await r) as { id: string; po_number: number; vendor_name: string; po_type: string; status: string }[];
}
export async function searchJobwork(q: string) {
  let r = supabase.from('jobwork_orders').select('id, jw_number, vendor_name, job_type, sku, status').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(20);
  const n = parseInt(q.replace(/\D/g, ''), 10);
  if (q.trim()) r = !isNaN(n) && /^\D*\d+\D*$/.test(q.trim()) ? r.eq('jw_number', n) : r.or(`vendor_name.ilike.%${q.trim().replace(/[%_,()]/g, '')}%,sku.ilike.%${q.trim().replace(/[%_,()]/g, '')}%`);
  return must(await r) as { id: string; jw_number: number; vendor_name: string; job_type: string | null; sku: string | null; status: string }[];
}
