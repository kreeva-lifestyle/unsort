// Flow attachments (owner's ask): any file kept with a pipeline or with one of
// its steps — fabric swatches, vendor quotes, tailor sheets, bills. Private
// bucket flow-files (staff only, 10 MB); photos are compressed on the phone
// first, like Product Costing attachments; PDFs, sheets and documents go up
// as-is. Path: <pipeline id>/<uuid>.<ext>; the row lives in flow_attachments.
import { supabase } from '../../lib/supabase';
import { optimizeImage } from '../minis/costing/imageResize';
import { logSwallowed } from '../../lib/errorLogger';
import type { FlowAttachment } from '../../types/flow';

const BUCKET = 'flow-files';
export const MAX_BYTES = 10 * 1024 * 1024;
const OTHER_TYPES: Record<string, string> = {
  pdf: 'application/pdf', csv: 'text/csv', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const ACCEPT = 'image/*,.pdf,.csv,.xls,.xlsx,.doc,.docx';
export const fileSize = (b: number | null) => !b ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
export const isImage = (a: Pick<FlowAttachment, 'type'>) => !!a.type?.startsWith('image/');

async function prepare(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (OTHER_TYPES[ext]) {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} is ${fileSize(file.size)} — files can be up to 10 MB`);
    return { blob: file, type: OTHER_TYPES[ext], ext };
  }
  if (!file.type.startsWith('image/') && !/^(heic|heif|jpe?g|png|webp)$/.test(ext)) {
    throw new Error(`${file.name}: attach photos, PDFs, Excel/CSV or Word files`);
  }
  const out = await optimizeImage(file, 1600, 0.8);
  return { blob: out.blob, type: out.type, ext: out.type === 'image/png' ? 'png' : out.type === 'image/webp' ? 'webp' : 'jpg' };
}

/** Upload one file and record it against the pipeline (and step, if any). */
export async function uploadFlowFile(pipelineId: string, stepId: string | null, file: File): Promise<FlowAttachment> {
  const { blob, type, ext } = await prepare(file);
  const path = `${pipelineId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
  if (up.error) throw up.error;
  const name = file.name.trim().slice(0, 120) || `file.${ext}`;
  const { data, error } = await supabase.from('flow_attachments')
    .insert({ pipeline_id: pipelineId, step_id: stepId, path, name, type, size: blob.size })
    .select('id, pipeline_id, step_id, path, name, type, size, uploaded_by, created_at').single();
  if (error) {
    // The row failed: do not leave an orphan file behind (best effort).
    const rm = await supabase.storage.from(BUCKET).remove([path]);
    if (rm.error) logSwallowed('flow file cleanup', rm.error);
    throw error;
  }
  return data as FlowAttachment;
}

/** Signed links (1 hour) to open / preview the files — the bucket is private. */
export async function signedUrls(files: FlowAttachment[]): Promise<Record<string, string>> {
  if (files.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(files.map(f => f.path), 3600);
  if (error) throw error;
  return Object.fromEntries((data || []).filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl as string]));
}

/** Remove the row first (so the list is right even if storage lags), then the file. */
export async function deleteFlowFile(f: FlowAttachment) {
  const { error } = await supabase.from('flow_attachments').delete().eq('id', f.id);
  if (error) throw error;
  const rm = await supabase.storage.from(BUCKET).remove([f.path]);
  if (rm.error) throw rm.error;
}
