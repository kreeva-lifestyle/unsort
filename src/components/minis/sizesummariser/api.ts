// Size Summariser — the device's side of the data: the source PDF into the
// private tailor-sheets bucket, illustrations into the public tailor-diagrams
// bucket (once per content hash), the extract call to the size-summariser
// edge function, the history list and the settings row.
import { supabase, SUPABASE_ANON_KEY } from '../../../lib/supabase';
import { logSwallowed } from '../../../lib/errorLogger';
import type { FormPage, FormDiagram } from './pdfForm';
import type { Extraction, ExtractionRow, SummariserSettings } from './types';
import { EXTRACTION_COLS } from './types';

const EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/size-summariser';
const DIAGRAM_BUCKET = 'tailor-diagrams';
const SHEET_BUCKET = 'tailor-sheets';

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY };
}

/** The settings row; defaults when it is missing. Readable by everyone signed in. */
export async function loadSettings(): Promise<SummariserSettings> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'size_summariser').maybeSingle();
  if (error) throw error;
  const v = (data?.value || {}) as Partial<SummariserSettings>;
  return {
    model: v.model || 'claude-sonnet-5-5', effort: v.effort || '', prompt: v.prompt || '', prompt_version: v.prompt_version || 1,
    order_no_regex: v.order_no_regex || '^[A-Z]{2,5}-?\\d{3,7}$', measurement_min: v.measurement_min ?? 0, measurement_max: v.measurement_max ?? 80,
    required_fields: v.required_fields || {}, sheet_title: v.sheet_title || '', footer_text: v.footer_text || '', raster_only_option_pages: !!v.raster_only_option_pages,
  };
}
export async function saveSettings(s: SummariserSettings): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key: 'size_summariser', value: s, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

/** The source PDF, kept so a later re-run on another model can read it again. Returns the storage path. */
export async function uploadSource(file: File): Promise<string> {
  const d = new Date();
  const path = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(SHEET_BUCKET).upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  return path;
}
export async function downloadSource(path: string): Promise<File> {
  const { data, error } = await supabase.storage.from(SHEET_BUCKET).download(path);
  if (error) throw error;
  return new File([data], path.split('/').pop() || 'form.pdf', { type: 'application/pdf' });
}

/** Store each new illustration once; returns page → hash for the extraction row. */
export async function storeDiagrams(diagrams: FormDiagram[], formType: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!diagrams.length) return map;
  const hashes = [...new Set(diagrams.map(d => d.hash))];
  const { data: known } = await supabase.from('stitching_diagrams').select('hash').in('hash', hashes);
  const have = new Set(((known as { hash: string }[] | null) || []).map(k => k.hash));
  for (const d of diagrams) {
    map[String(d.page)] = d.hash;
    if (have.has(d.hash)) continue;
    const path = `${d.hash}.png`;
    const up = await supabase.storage.from(DIAGRAM_BUCKET).upload(path, d.blob, { contentType: 'image/png', upsert: true });
    if (up.error) { logSwallowed('diagram upload', up.error); continue; }
    const ins = await supabase.from('stitching_diagrams').insert({ hash: d.hash, storage_path: path, form_type: formType });
    if (ins.error && ins.error.code !== '23505') logSwallowed('diagram row', ins.error);
    have.add(d.hash);
  }
  return map;
}
export const diagramUrl = (hash: string) => supabase.storage.from(DIAGRAM_BUCKET).getPublicUrl(`${hash}.png`).data.publicUrl;

/** Remember which measurement each illustration belongs to (first time seen); later forms are checked against it. */
export async function labelDiagrams(map: Record<string, string>, ex: Extraction): Promise<string[]> {
  const mismatches: string[] = [];
  const byPage = new Map(ex.measurements.map(m => [String(m.page), m.key]));
  const hashes = Object.values(map);
  if (!hashes.length) return mismatches;
  const { data } = await supabase.from('stitching_diagrams').select('hash, measurement_key').in('hash', hashes);
  const known = new Map(((data as { hash: string; measurement_key: string | null }[] | null) || []).map(r => [r.hash, r.measurement_key]));
  for (const [page, hash] of Object.entries(map)) {
    const key = byPage.get(page); if (!key) continue;
    const was = known.get(hash);
    if (!was) { const { error } = await supabase.from('stitching_diagrams').update({ measurement_key: key }).eq('hash', hash).is('measurement_key', null); if (error) logSwallowed('diagram label', error); }
    else if (was !== key) mismatches.push(`पेज ${page} की तस्वीर पहले "${was}" के साथ देखी गई थी, अब "${key}" — जाँचें`);
  }
  return mismatches;
}

export interface ExtractResult { ok: boolean; id?: string; extraction?: Extraction; usage?: unknown; est_usd?: number; model?: string; prompt_version?: number; pii_detected?: boolean; unresolved?: string[]; error?: string; details?: string }

/** The model call. Pages carry text + a JPEG; the server stores the row. Up to 3 minutes. */
export async function extract(body: { pages: FormPage[]; file_name: string; form_type: string; page_count: number; source_path?: string; diagrams?: Record<string, string>; parent_id?: string; model?: string; effort?: string }): Promise<ExtractResult> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 180_000);
  try {
    const resp = await fetch(EDGE_FN, { method: 'POST', headers: await headers(), signal: ctl.signal, body: JSON.stringify({ action: 'extract', ...body, pages: body.pages.filter(p => p.isAnswer).map(p => ({ n: p.n, text: p.text, image: p.image })) }) });
    const data = await resp.json().catch(() => null);
    return data || { ok: false, error: `Server replied ${resp.status}` };
  } catch (e) {
    return { ok: false, error: (e as { name?: string })?.name === 'AbortError' ? 'The model took too long — try again' : 'Cannot reach the server' };
  } finally { clearTimeout(t); }
}

export async function listExtractions(limit = 50): Promise<ExtractionRow[]> {
  const { data, error } = await supabase.from('stitching_extractions').select(EXTRACTION_COLS).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as unknown as ExtractionRow[] | null) || [];
}
