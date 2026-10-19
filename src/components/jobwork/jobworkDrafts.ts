// Jobwork drafts: a New job form saved half-filled (table jobwork_drafts —
// its own, so a draft never counts as a job in the list, summary, Share
// pending or auto-close). "Create job" saves the job through
// save_jobwork_order like any new job, then removes the draft.
import { supabase } from '../../lib/supabase';
import type { JobworkDraft, JobworkDraftForm } from '../../types/database';
import { today, type JobDetail } from './jobworkModel';
import { saveJob, type JobDraft, type MaterialDraft } from './jobworkApi';

const COLS = 'id, form, created_by, created_at, updated_by, updated_at';

/** Newest first, with the name of whoever saved each one last. */
export async function listDrafts(): Promise<{ rows: JobworkDraft[]; names: Record<string, string>; error: unknown }> {
  const { data, error } = await supabase.from('jobwork_drafts').select(COLS).order('updated_at', { ascending: false }).limit(100);
  const rows = (data ?? []) as JobworkDraft[];
  const ids = [...new Set(rows.map(r => r.updated_by).filter((x): x is string => !!x))];
  const names: Record<string, string> = {};
  if (ids.length) {
    const p = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const u of (p.data ?? []) as { id: string; full_name: string | null }[]) names[u.id] = u.full_name?.trim() || 'User';
  }
  return { rows, names, error };
}

export async function draftCount(): Promise<{ count: number | null; error: unknown }> {
  const { count, error } = await supabase.from('jobwork_drafts').select('id', { count: 'exact', head: true });
  return { count: error ? null : count ?? 0, error };
}

/** Save over the draft `id`, or as a new draft. If someone already finished
 *  or discarded that draft, it is saved as a new one — typing is never lost. */
export async function saveDraft(id: string | null, form: JobworkDraftForm): Promise<{ id: string | null; error: unknown; recreated?: boolean }> {
  if (id) {
    const { data, error } = await supabase.from('jobwork_drafts').update({ form }).eq('id', id).select('id').maybeSingle();
    if (error) return { id: null, error };
    if (data) return { id: (data as { id: string }).id, error: null };
  }
  const { data, error } = await supabase.from('jobwork_drafts').insert({ form }).select('id').single();
  return { id: (data as { id: string } | null)?.id ?? null, error, recreated: !!id };
}

export const deleteDraft = (id: string) => supabase.from('jobwork_drafts').delete().eq('id', id);

/**
 * Create the job from draft `id`. The draft is taken first (deleted, and the
 * delete must find it), so two people finishing the same draft cannot make
 * two jobs; if the job then cannot be saved, the draft is put back.
 */
export async function createFromDraft(id: string, d: JobDraft, rows: MaterialDraft[], form: JobworkDraftForm): Promise<{ id: string | null; error: unknown }> {
  const taken = await supabase.from('jobwork_drafts').delete().eq('id', id).select('id');
  if (taken.error) return { id: null, error: taken.error };
  if (!taken.data?.length) return { id: null, error: new Error('This draft was already finished or discarded by someone else.') };
  const r = await saveJob(null, d, rows);
  if (r.error || !r.id) {
    const back = await supabase.from('jobwork_drafts').insert({ id, form });
    if (back.error) return { id: null, error: new Error('Job not saved and the draft not put back — press Save as draft.') };
  }
  return r;
}

/** Anything worth keeping typed in? (A blank form — today's date aside — is not a draft.) */
export const hasContent = (f: JobworkDraftForm) =>
  !!(f.vendor_name.trim() || f.sku.trim() || f.job_type.trim() || f.component.trim() || f.pieces.trim() || f.rate.trim() || f.notes.trim() || f.materials.some(m => m.name.trim()));

/** The form's starting values: an existing job (edit), a saved draft, or blank. */
export function startForm(edit: JobDetail | null, draft: JobworkDraft | null): { d: JobDraft; mats: MaterialDraft[] } {
  const j = edit?.job;
  if (j) return {
    d: { vendor_id: j.vendor_id, vendor_name: j.vendor_name, vendor_phone: j.vendor_phone ?? '', job_type: j.job_type, sku: j.sku,
      component: j.component ?? '', costing_product_id: j.costing_product_id, pieces: String(j.pieces), qty_unit: j.qty_unit, rate: String(j.rate),
      job_date: j.job_date, expected_date: j.expected_date ?? '', notes: j.notes ?? '' },
    mats: (edit.materials ?? []).filter(m => !m.removed).map(m => ({ id: m.id, name: m.name, unit: m.unit, per_piece: m.per_piece == null ? '' : String(m.per_piece) })),
  };
  const blank: JobDraft = { vendor_id: null, vendor_name: '', vendor_phone: '', job_type: '', sku: '', component: '', costing_product_id: null, pieces: '', qty_unit: 'pcs', rate: '', job_date: today(), expected_date: '', notes: '' };
  if (!draft) return { d: blank, mats: [] };
  const { materials, ...f } = draft.form;
  // Filled over the blank form, so a draft saved by an older version still
  // opens. A job date never picked is saved blank and becomes today again.
  return { d: { ...blank, ...f, job_date: f.job_date || blank.job_date }, mats: (materials ?? []).map(m => ({ name: m.name, unit: m.unit, per_piece: m.per_piece })) };
}

/** What a draft keeps: the form as typed, materials without their ids. */
export const toDraftForm = (d: JobDraft, mats: MaterialDraft[]): JobworkDraftForm =>
  ({ ...d, materials: mats.filter(m => m.name.trim()).map(m => ({ name: m.name, unit: m.unit, per_piece: m.per_piece })) });
