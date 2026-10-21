// "Start jobwork" from a received fabric PO (owner's ask): the new-job form
// filled from the PO — the SKU, the pieces it was bought for, one material
// per fabric line that arrived (usage per piece from the order) — and how
// much of each line can still go to a jobworker: what arrived minus what
// earlier jobs from that line still hold. The vendor, job type and rate stay
// blank (the fabric supplier is not the jobworker). Saving goes through
// start_jobwork_from_po: the job, its fabric linked to the PO lines and the
// first hand-over of fabric in one transaction.
import { supabase } from '../../lib/supabase';
import { itemLabel } from '../purchaseorders/poItemLabel';
import { unitOf } from '../purchaseorders/poStats';
import type { JobDraft, MaterialDraft } from './jobworkApi';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export interface PoFabric { po_item_id: string; label: string; unit: string | null; received: number; carried: number }
export interface JobPrefill { po: { id: string; number: number }; d: Partial<JobDraft>; mats: MaterialDraft[]; fabric: PoFabric[] }
type Line = Pick<PurchaseOrderItem, 'id' | 'sku' | 'item_name' | 'fabric_code' | 'unit' | 'quantity' | 'received_qty'>;

const n = (v: unknown) => Number(v || 0);
const key = (s: string | null | undefined) => (s || '').trim().toUpperCase();
/** Jobwork's material units: metres stay Meter, pieces become Pcs. */
const matUnit = (u: string | null) => (unitOf(u) === 'pcs' ? 'Pcs' : 'Meter');

/** The SKUs with fabric in — a PO bought for several designs starts one job per design. */
export const skusOf = (items: Line[]): string[] => [...new Set(items.filter(it => n(it.received_qty) > 0 && key(it.sku)).map(it => key(it.sku)))];

/** The job as the PO fills it, with what is still free of each fabric line. */
export async function prefillFromPo(po: Pick<PurchaseOrder, 'id' | 'po_number' | 'for_pieces'>, items: Line[], sku: string): Promise<{ prefill: JobPrefill | null; error: unknown }> {
  const lines = items.filter(it => n(it.received_qty) > 0 && key(it.sku) === key(sku));
  const { data, error } = await supabase.from('jobwork_materials').select('po_item_id, jobwork_entry_lines(qty, jobwork_entries(kind))').in('po_item_id', lines.map(it => it.id));
  if (error) return { prefill: null, error };
  const carried = new Map<string, number>();
  type Row = { po_item_id: string; jobwork_entry_lines: { qty: number; jobwork_entries: { kind: string } | { kind: string }[] | null }[] };
  for (const m of (data as unknown as Row[] | null) ?? []) for (const l of m.jobwork_entry_lines ?? []) {
    const e = Array.isArray(l.jobwork_entries) ? l.jobwork_entries[0] : l.jobwork_entries;
    carried.set(m.po_item_id, (carried.get(m.po_item_id) ?? 0) + (e?.kind === 'in' ? -n(l.qty) : n(l.qty)));
  }
  const pcs = n(po.for_pieces);
  const fabric = lines.map(it => ({ po_item_id: it.id, label: itemLabel(it), unit: it.unit, received: n(it.received_qty), carried: Math.max(0, carried.get(it.id) ?? 0) }));
  return {
    prefill: {
      po: { id: po.id, number: po.po_number },
      d: { sku: key(sku), pieces: pcs > 0 ? String(pcs) : '', qty_unit: 'pcs', notes: `Fabric from PO #${po.po_number}` },
      // Usage per piece: what the order bought for its pieces (4 decimals, as typed elsewhere).
      mats: lines.map((it, i) => ({ name: itemLabel(it), unit: matUnit(it.unit), per_piece: pcs > 0 ? String(Math.round(n(it.quantity) / pcs * 10000) / 10000) : '', po_item_id: it.id, send_qty: String(Math.max(0, fabric[i].received - fabric[i].carried)) })),
      fabric,
    },
    error: null,
  };
}

/** Create the job from the PO (and hand the fabric over now when `handover`). */
export async function startFromPo(poId: string, d: JobDraft, mats: MaterialDraft[], handover: boolean): Promise<{ id: string | null; error: unknown }> {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const { data, error } = await supabase.rpc('start_jobwork_from_po', {
    p_po_id: poId,
    p_order: { ...d, pieces: num(d.pieces), rate: num(d.rate) ?? 0, expected_date: d.expected_date || null, job_date: d.job_date || null },
    p_materials: mats.map(m => ({ id: null, name: m.name, unit: m.unit, per_piece: num(m.per_piece), po_item_id: m.po_item_id ?? null, send_qty: num(m.send_qty ?? '') ?? 0 })),
    p_handover: handover,
  });
  return { id: (data as string | null) ?? null, error };
}
