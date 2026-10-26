// size-summariser Edge Function — Minis → Size Summariser.
//
// The phone/PC reads the customer's Google Forms stitching-measurement PDF
// with pdf.js (text per page + a raster of every answer page); this function
// sends them to Claude with vision and a strict tool schema, checks the
// answer deterministically (order number, no customer details, every value
// really on its page, required fields, numeric sanity), stores the
// extraction and returns it. The one-page Hindi sheet is rendered by the app.
//
//   POST { action: 'status' }                                   -> { ok, hasKey, model, effort, prompt_version }
//   POST { action: 'extract', pages: [{ n, text, image? }], file_name, form_type, page_count,
//          source_path?, diagrams?, parent_id?, model?, effort? }  -> { ok, id, extraction, usage, est_usd, model }
//
// Nothing that is data lives here: model, effort, prompt (+ version), order
// number regex, measurement range, required fields per garment, sheet
// title and footer come from app_settings.size_summariser (edited in
// Settings → Size Summariser). The Anthropic key is app_secrets.anthropic_api_key.

// deno-lint-ignore-file no-explicit-any
import { SCHEMA, piiValues, validate, type Page, type Settings } from './validate.ts';
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };
const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:5199'];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
const json = (body: unknown, req: Request, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request, details?: string) => json({ ok: false, error, details }, req, status);

async function caller(req: Request): Promise<{ id: string; role: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_active,role`, { headers: svcHeaders });
  const prof = (await p.json().catch(() => []))?.[0];
  if (!prof || prof.is_active === false) return null;
  return { id: user.id, role: String(prof.role || '') };
}

async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  return (await r.json().catch(() => []))?.[0]?.value ?? null;
}

// ── Settings (app_settings.size_summariser) ─────────────────────────────────
const MODELS: Record<string, { in: number; out: number; read: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2 },
};
async function getSettings(): Promise<Settings> {
  const r = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.size_summariser&select=value`, { headers: svcHeaders });
  const v = (await r.json().catch(() => []))?.[0]?.value || {};
  return {
    model: MODELS[v.model] ? v.model : 'claude-sonnet-5-5',
    effort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(v.effort) ? v.effort : '',
    prompt: String(v.prompt || ''),
    prompt_version: Number(v.prompt_version) || 1,
    order_no_regex: String(v.order_no_regex || '^[A-Z]{2,5}-?\\d{3,7}$'),
    measurement_min: Number(v.measurement_min ?? 0),
    measurement_max: Number(v.measurement_max ?? 80),
    required_fields: v.required_fields && typeof v.required_fields === 'object' ? v.required_fields : {},
    sheet_title: String(v.sheet_title || ''),
    footer_text: String(v.footer_text || ''),
    raster_only_option_pages: !!v.raster_only_option_pages,
  };
}

// ── The tool schema the model must fill ─────────────────────────────────────
function claudeRequest(apiKey: string, model: string, effort: string, body: Record<string, unknown>): RequestInit {
  const fallback = model !== 'claude-haiku-5-5';
  return {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}) },
    body: JSON.stringify({ model, ...body, ...(effort ? { output_config: { effort } } : {}), ...(fallback ? { fallbacks: 'default' } : {}) }),
  };
}

/** One model call: pages interleaved text → image; the answer is the tailor_sheet tool call. */
async function extract(apiKey: string, s: Settings, model: string, effort: string, pages: Page[], retryNote?: string): Promise<{ data: any; usage: Usage; model: string }> {
  const content: any[] = [];
  for (const p of pages) {
    content.push({ type: 'text', text: `PAGE ${p.n} TEXT:\n${p.text || '(no text)'}` });
    if (p.image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.image } });
  }
  content.push({ type: 'text', text: `That is the whole form (${pages.length} pages). Call the tailor_sheet tool exactly once with everything a tailor needs.${retryNote ? `\n\nYour previous answer was rejected: ${retryNote}. Fix it and call the tool again.` : ''}` });
  const r = await fetch('https://api.anthropic.com/v1/messages', claudeRequest(apiKey, model, effort, {
    max_tokens: 12000,
    system: [{ type: 'text', text: s.prompt, cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 'tailor_sheet', description: 'The complete, PII-free extraction for the one-page Hindi tailor sheet.', input_schema: SCHEMA }],
    messages: [{ role: 'user', content }],
  }));
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Claude ${r.status}: ${body?.error?.message || 'unknown'}`);
  const tool = (body?.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'tailor_sheet');
  if (!tool?.input) throw new Error('The model did not fill the tailor sheet');
  return { data: tool.input, usage: body.usage, model: body.model || model };
}

const estUsd = (model: string, u: Usage) => {
  const p = MODELS[model] || MODELS['claude-sonnet-5-5'];
  return Math.round(((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.in * 1.25 + (u.cache_read_input_tokens || 0) * p.read + (u.output_tokens || 0) * p.out) / 1e6 * 10000) / 10000;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);
  const who = await caller(req);
  if (!who) return fail(401, 'Sign in to DailyOffice first', req);
  let body: any;
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body', req); }
  const action = String(body?.action || '');
  try {
    const s = await getSettings();
    if (action === 'status') return json({ ok: true, hasKey: !!(await getSecret('anthropic_api_key')), model: s.model, effort: s.effort, prompt_version: s.prompt_version, sheet_title: s.sheet_title, footer_text: s.footer_text }, req);
    if (action !== 'extract') return fail(400, `Unknown action: ${action}`, req);
    if (!['admin', 'manager', 'operator'].includes(who.role)) return fail(403, 'Only operators and above can run the summariser', req);
    const apiKey = await getSecret('anthropic_api_key');
    if (!apiKey) return fail(503, 'No Anthropic API key is set (Settings → Listing AI)', req);
    const pages: Page[] = Array.isArray(body.pages) ? body.pages.filter((p: any) => p && Number.isInteger(p.n)).map((p: any) => ({ n: p.n, text: String(p.text || '').slice(0, 6000), image: typeof p.image === 'string' && p.image.length > 100 ? p.image : undefined })) : [];
    if (!pages.length) return fail(400, 'No pages were sent', req);
    if (pages.length > 60) return fail(400, 'More than 60 pages — not a measurement form', req);
    if (!pages.some(p => p.image)) return fail(400, 'Page images are required to read the ticked options', req);
    const model = MODELS[body.model] ? String(body.model) : s.model;
    const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(body.effort) ? String(body.effort) : s.effort;
    const piiList = piiValues(pages);

    let result = await extract(apiKey, s, model, effort, pages);
    let v = validate(result.data, pages, s, piiList);
    const usage: Usage = { ...result.usage };
    if (v.errors.length) {
      // One retry with the checker's complaint; whatever comes back is used.
      const again = await extract(apiKey, s, model, effort, pages, v.errors.join('; '));
      for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] = (usage[k] || 0) + (again.usage?.[k] || 0);
      result = again; v = validate(again.data, pages, s, piiList);
    }
    const data = v.data;
    const low = data.measurements.filter((m: any) => m.confidence === 'low').length + data.choices.filter((c: any) => c.confidence === 'low').length;
    const row = {
      order_no: data.order?.order_no || null, form_type: String(body.form_type || data.order?.garment_type || 'unknown'), model: result.model, effort: effort || null,
      prompt_version: s.prompt_version, extraction: data, diagrams: body.diagrams && typeof body.diagrams === 'object' ? body.diagrams : {},
      warnings_count: data.warnings.length, low_confidence_count: low, pii_detected: v.pii,
      source_path: body.source_path ? String(body.source_path) : null, file_name: body.file_name ? String(body.file_name).slice(0, 200) : null,
      page_count: Number(body.page_count) || pages.length, parent_id: body.parent_id || null, usage, est_usd: estUsd(result.model, usage), created_by: who.id,
    };
    const ins = await fetch(`${SB_URL}/rest/v1/stitching_extractions`, { method: 'POST', headers: { ...svcHeaders, prefer: 'return=representation' }, body: JSON.stringify(row) });
    const saved = (await ins.json().catch(() => []))?.[0];
    if (!ins.ok || !saved?.id) return fail(500, 'Could not save the extraction', req, JSON.stringify(saved).slice(0, 300));
    return json({ ok: true, id: saved.id, extraction: data, usage, est_usd: row.est_usd, model: result.model, prompt_version: s.prompt_version, pii_detected: v.pii, unresolved: v.errors }, req);
  } catch (e) {
    const msg = (e as Error)?.message || 'Server error';
    console.error('size-summariser error:', msg);
    return fail(500, 'Server error', req, msg);
  }
});
