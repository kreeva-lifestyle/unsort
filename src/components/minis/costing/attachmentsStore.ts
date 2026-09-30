// Product Costing attachments (owner's ask): photos and PDFs kept with the
// sheet — vendor quotes, fabric swatches, bills. Photos are compressed ON
// THE PHONE before upload (1600px long edge, JPEG) so a 5 MB camera shot
// lands at a few hundred KB and still reads when zoomed; PDFs go up as-is
// under a size cap. Files live in the existing public costing-images bucket
// under attachments/<costing id>/<random uuid>.<ext>, and the list is the
// costing_products.attachments jsonb column.
import { supabase } from '../../../lib/supabase';
import { optimizeImage } from './imageResize';
import type { CostingAttachment } from './costingModel';

const BUCKET = 'costing-images';
export const MAX_ATTACHMENTS = 20;
export const MAX_PDF = 10 * 1024 * 1024;
const KEEP_AS_IS = /^image\/(jpeg|png|webp)$/;

export const fileSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const isImage = (a: CostingAttachment) => a.type.startsWith('image/');

/** Photos: resize + re-encode. If the original is already a small web image
 *  and the re-encode came out bigger (screenshots), keep the original. */
async function prepare(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF) throw new Error(`${file.name} is ${fileSize(file.size)} — PDFs can be up to 10 MB`);
    return { blob: file, type: 'application/pdf', ext: 'pdf' };
  }
  if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
    throw new Error(`${file.name}: only photos and PDFs can be attached`);
  }
  const out = await optimizeImage(file, 1600, 0.8);
  if (KEEP_AS_IS.test(file.type) && file.size <= out.blob.size) {
    return { blob: file, type: file.type, ext: file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg' };
  }
  return { blob: out.blob, type: out.type, ext: out.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'img').toLowerCase() };
}

/** Compress (photos) and upload one file; returns the attachment record. */
export async function uploadAttachment(costingId: string, file: File): Promise<CostingAttachment> {
  const { blob, type, ext } = await prepare(file);
  const path = `attachments/${costingId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return {
    path, url: data.publicUrl, type, size: blob.size, original_size: file.size,
    name: file.name.trim().slice(0, 120) || `attachment.${ext}`, uploaded_at: new Date().toISOString(),
  };
}

/** Write the list straight to a sheet that already exists in the DB, so an
 *  upload or removal is never lost to an unsaved sheet. */
export async function persistAttachments(costingId: string, list: CostingAttachment[]) {
  const { error } = await supabase.from('costing_products')
    .update({ attachments: list, updated_at: new Date().toISOString() }).eq('id', costingId);
  if (error) throw error;
}

/** Delete the stored file — only when it was uploaded for THIS sheet. A
 *  duplicated sheet references its source's files; removing one there just
 *  unlinks it, so the original sheet never loses its attachment. */
export async function removeObject(costingId: string, a: CostingAttachment) {
  if (!a.path.startsWith(`attachments/${costingId}/`)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([a.path]);
  if (error) throw error;
}
