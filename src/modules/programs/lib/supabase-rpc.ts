// Programs module — all Supabase RPC + query calls
import { supabase } from '../../../lib/supabase';
import type { Program, ProgramMatching, ProgramPrice, ProgramPricePart, ProgramHistoryEntry, ProgramFormData, PricePartRow } from '../types';

// ── List + search ────────────────────────────────────────────────────────
export async function fetchPrograms(opts: { search?: string; page?: number; pageSize?: number } = {}) {
  const { search, page = 0, pageSize = 25 } = opts;
  let q = supabase.from('programs')
    .select('id, program_uid, selling_sku, manufacturing_sku, matching, dropbox_gdrive_link, voice_note_path, share_token, created_by, created_at, updated_at, is_deleted', { count: 'estimated' })
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);
  if (search && search.length <= 200) q = q.textSearch('search_vector', search, { type: 'websearch', config: 'simple' });
  const { data, count, error } = await q;
  return { data: (data as Program[] | null) || [], count: count || 0, error };
}

export async function fetchProgramById(id: string) {
  const { data, error } = await supabase.from('programs')
    .select('id, program_uid, selling_sku, manufacturing_sku, matching, dropbox_gdrive_link, voice_note_path, share_token, created_by, created_at, updated_at, is_deleted')
    .eq('id', id).maybeSingle();
  return { data: data as Program | null, error };
}

// ── Matchings ────────────────────────────────────────────────────────────
export async function fetchMatchings(programId: string) {
  const { data, error } = await supabase.from('program_matchings')
    .select('id, program_id, company_name, matching_label, created_at')
    .eq('program_id', programId).order('created_at');
  return { data: (data as ProgramMatching[] | null) || [], error };
}

// ── Price + parts ────────────────────────────────────────────────────────
export async function fetchPriceWithParts(programId: string) {
  const { data: price } = await supabase.from('program_prices')
    .select('id, program_id, created_at, updated_at')
    .eq('program_id', programId).maybeSingle();
  if (!price) return { price: null, parts: [] };
  const { data: parts } = await supabase.from('program_price_parts')
    .select('id, program_price_id, part_name, stitch, one_rs, stitch_rate, one_mp, meter_per_pcs, rate, total, fabric_name, fabric_meter, section, sort_order, created_at')
    .eq('program_price_id', price.id).order('sort_order');
  return { price: price as ProgramPrice, parts: (parts as ProgramPricePart[] | null) || [] };
}

// ── Upsert program (RPC — atomic) ────────────────────────────────────────
export async function upsertProgram(form: ProgramFormData, id?: string, expectedUpdatedAt?: string) {
  const { data, error } = await supabase.rpc('upsert_program', {
    p_id: id || null,
    p_selling_sku: form.selling_sku || null,
    p_manufacturing_sku: form.manufacturing_sku || null,
    p_matching: null,
    p_dropbox_gdrive_link: form.dropbox_gdrive_link || null,
    p_matchings: form.matchings,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
  return { result: data as { ok: boolean; id?: string; error?: string; updated_at?: string } | null, error };
}

// ── Upsert price (RPC — atomic) ──────────────────────────────────────────
export async function upsertProgramPrice(programId: string, parts: PricePartRow[]) {
  const { data, error } = await supabase.rpc('upsert_program_price', {
    p_program_id: programId,
    p_parts: parts.map((p, i) => ({ ...p, sort_order: i })),
  });
  return { result: data as { ok: boolean; price_id?: string } | null, error };
}

// ── Soft delete ──────────────────────────────────────────────────────────
export async function softDeleteProgram(id: string) {
  const { error } = await supabase.from('programs')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

// ── Share token ──────────────────────────────────────────────────────────
export async function generateShareToken(programId: string) {
  const { data, error } = await supabase.rpc('generate_share_token', { p_program_id: programId });
  return { token: data as string | null, error };
}

// ── Voice note upload ────────────────────────────────────────────────────
export async function uploadVoiceNote(programId: string, file: Blob, ext: string = 'webm') {
  const path = `${programId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('program-voice-notes').upload(path, file, { contentType: ext === 'webm' ? 'audio/webm' : 'audio/mp4', upsert: true });
  if (upErr) return { path: null, error: upErr };
  await supabase.from('programs').update({ voice_note_path: path, updated_at: new Date().toISOString() }).eq('id', programId);
  return { path, error: null };
}

export function getVoiceNoteUrl(path: string) {
  const { data } = supabase.storage.from('program-voice-notes').getPublicUrl(path);
  return data.publicUrl;
}

// ── History ──────────────────────────────────────────────────────────────
export async function fetchHistory(programId: string) {
  const { data, error } = await supabase.from('program_history')
    .select('id, program_id, user_id, user_email, action, field_changed, old_value, new_value, changed_at')
    .eq('program_id', programId).order('changed_at', { ascending: false }).limit(100);
  return { data: (data as ProgramHistoryEntry[] | null) || [], error };
}

// ── User language preference ─────────────────────────────────────────────
export async function getLanguagePref() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'en';
  const { data } = await supabase.from('program_user_preferences')
    .select('language').eq('user_id', user.id).maybeSingle();
  return (data?.language as 'en' | 'gu') || 'en';
}

export async function setLanguagePref(lang: 'en' | 'gu') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('program_user_preferences').upsert({ user_id: user.id, language: lang, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
}

// ── Matching company count (for list view badge) ─────────────────────────
export async function fetchMatchingCounts(programIds: string[]) {
  if (programIds.length === 0) return {};
  const { data } = await supabase.from('program_matchings')
    .select('program_id').in('program_id', programIds);
  const counts: Record<string, number> = {};
  (data || []).forEach(r => { counts[r.program_id] = (counts[r.program_id] || 0) + 1; });
  return counts;
}

// ── Price summaries for list view (total work amount + fabric meter) ──────
export async function fetchPriceSummaries(programIds: string[]) {
  if (programIds.length === 0) return {};
  const { data: prices } = await supabase.from('program_prices').select('id, program_id').in('program_id', programIds);
  if (!prices || prices.length === 0) return {};
  const priceIds = prices.map(p => p.id);
  const { data: parts } = await supabase.from('program_price_parts')
    .select('program_price_id, total, fabric_meter, section')
    .in('program_price_id', priceIds);
  const result: Record<string, { workTotal: number; fabricMeter: number }> = {};
  const priceToProgram: Record<string, string> = {};
  prices.forEach(p => { priceToProgram[p.id] = p.program_id; });
  (parts || []).forEach(pt => {
    const pid = priceToProgram[pt.program_price_id];
    if (!pid) return;
    if (!result[pid]) result[pid] = { workTotal: 0, fabricMeter: 0 };
    if ((pt.section || 'work') === 'work') {
      result[pid].workTotal += Number(pt.total || 0);
      result[pid].fabricMeter += Number(pt.fabric_meter || 0);
    } else {
      result[pid].fabricMeter += Number(pt.fabric_meter || 0);
    }
  });
  return result;
}

// ── Lookup tables (dropdowns with auto-save) ─────────────────────────────
export async function fetchLookup(table: 'program_lookup_part_names' | 'program_lookup_fabric_names' | 'program_lookup_brands') {
  const { data } = await supabase.from(table).select('name').order('name');
  return (data || []).map(r => r.name);
}

export async function addLookup(table: 'program_lookup_part_names' | 'program_lookup_fabric_names' | 'program_lookup_brands', name: string) {
  if (!name.trim()) return;
  await supabase.from(table).upsert({ name: name.trim() }, { onConflict: 'name' });
}
