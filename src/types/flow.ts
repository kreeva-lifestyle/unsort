// Flow — production pipelines on a canvas (migration 20261103090000_flow_module).
// One interface per table, as in database.ts.

export type FlowKind = 'po' | 'cutting' | 'jobwork' | 'stitching' | 'qc' | 'packing' | 'stock' | 'other';
export type FlowStepStatus = 'planned' | 'active' | 'done' | 'blocked';
export type FlowPipelineStatus = 'planning' | 'running' | 'done' | 'cancelled';

export interface FlowPipeline {
  id: string;
  flow_number: number;
  title: string;
  sku: string | null;
  pieces: number | null;
  sizes: string | null;
  costing_product_id: string | null;
  status: FlowPipelineStatus;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowStep {
  id: string;
  pipeline_id: string;
  kind: FlowKind;
  title: string;
  assignee: string | null;
  po_id: string | null;
  jobwork_order_id: string | null;
  qty_planned: number | null;
  qty_done: number;
  unit: string | null;
  status: FlowStepStatus;
  due_date: string | null;
  notes: string | null;
  x: number;
  y: number;
  created_at: string;
  updated_at: string;
}

export interface FlowEdge {
  id: string;
  pipeline_id: string;
  from_step: string;
  to_step: string;
  label: string | null;
  created_at: string;
}

export interface FlowAttachment {
  id: string;
  pipeline_id: string;
  step_id: string | null;
  path: string;
  name: string;
  type: string | null;
  size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface FlowTemplate {
  id: string;
  name: string;
  graph: { steps: Array<{ key: string; kind: FlowKind; title: string; assignee?: string; unit?: string; x: number; y: number }>; edges: Array<{ from: string; to: string; label?: string }> };
  created_by: string | null;
  created_at: string;
}
