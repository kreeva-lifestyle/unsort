// Persist a template so the stored workbook and the row's file metadata can
// never disagree. The failure the old inline save() had: it wrote the row
// (with the NEW file_name/sheet_name/header_row) and THEN uploaded the file —
// so a failed upload left the row describing a workbook that wasn't in storage,
// and exports silently misaligned to the wrong header row.
//
// Rules here: for an update, upload FIRST; if it fails, commit the row WITHOUT
// the file columns so it stays consistent with the workbook already stored. For
// an insert, the id is only known after the row exists, so insert then upload;
// if the upload fails, blank the file columns so export honestly falls back to
// a plain sheet instead of pointing at a missing file.
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import type { ListingTemplateField, ListingTemplateRule } from '../../types/database';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface PersistInput {
  id: string | null; // existing template id, or null for a new one
  name: string; marketplace: string;
  fields: ListingTemplateField[]; rules: ListingTemplateRule[];
  fileBuf: ArrayBuffer | null; fileName: string; sheetName: string; headerRow: number;
}

export async function persistTemplate(t: PersistInput, addToast: (m: string, k?: string) => void): Promise<boolean> {
  const base: Record<string, unknown> = { name: t.name, marketplace: t.marketplace, fields: t.fields, rules: t.rules, updated_at: new Date().toISOString() };
  const meta = { file_name: t.fileName, sheet_name: t.sheetName, header_row: t.headerRow };
  const put = (id: string) => supabase.storage.from('listing-templates')
    .upload(`${id}.xlsx`, new Blob([t.fileBuf!]), { upsert: true, contentType: XLSX_MIME });

  if (t.id) {
    let withMeta = !!t.fileBuf;
    if (t.fileBuf) {
      const up = await put(t.id);
      if (up.error) { withMeta = false; addToast(`Sheet settings saved, but the new workbook couldn't be stored — exports keep using the previous file. ${friendlyError(up.error)}`, 'error'); }
    }
    const { error } = await supabase.from('listing_templates').update(withMeta ? { ...base, ...meta } : base).eq('id', t.id);
    if (error) { addToast(friendlyError(error), 'error'); return false; }
    return true;
  }

  const uid = (await supabase.auth.getUser()).data.user?.id;
  const row = t.fileBuf ? { ...base, ...meta, created_by: uid } : { ...base, created_by: uid };
  const { data, error } = await supabase.from('listing_templates').insert(row).select('id').single();
  if (error || !data) { addToast(friendlyError(error || 'Save failed'), 'error'); return false; }
  if (t.fileBuf) {
    const up = await put(data.id);
    if (up.error) {
      await supabase.from('listing_templates').update({ file_name: '', sheet_name: '', header_row: 0 }).eq('id', data.id);
      addToast(`Template saved, but the workbook couldn't be stored — exports will use a plain sheet. ${friendlyError(up.error)}`, 'error');
    }
  }
  return true;
}
