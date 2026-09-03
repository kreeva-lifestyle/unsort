// pricing-ai — AI-powered cost-cutting suggestions for the Price Projector.
//
// The client sends the product's EXACT computed numbers (cost stack, price,
// margin, threshold) plus the deterministic suggestions it already shows.
// The model is asked for up to six further, concrete ideas grounded ONLY in
// those numbers (no invented suppliers, no invented prices), as JSON.
// Every call replaces the product's saved batch: DELETE old rows, INSERT the
// new one, keyed by an input_hash the client uses to spot stale batches.
// Auth: caller must be a signed-in admin/manager/operator (same as costing
// writes). The Anthropic key and the owner-picked model come from
// app_secrets (Settings → Listing AI), never from the client.
const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in',
  'http://localhost:5173',
  'http://localhost:4173',];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
}
const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request, details?: string) => json({ ok: false, error, details }, req, status);

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };
// USD per million tokens (input / output) — same table as listing-ai.
const MODELS: Record<string, { in: number; out: number }> = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-sonnet-5': { in: 3, out: 15 }, 'claude-opus-4-8': { in: 5, out: 25 } };
const DEFAULT_MODEL = 'claude-haiku-4-5';
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const estUsdOf = (model: string, u: Usage): number => {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  const usd = (u.input_tokens * p.in + u.cache_creation_input_tokens * p.in * 1.25 + u.cache_read_input_tokens * p.in * 0.1 + u.output_tokens * p.out) / 1e6;
  return Math.round(usd * 10000) / 10000;
};

async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}
async function getModel(): Promise<string> { const m = (await getSecret('listing_ai_model')) || ''; return MODELS[m] ? m : DEFAULT_MODEL; }

async function caller(req: Request): Promise<{ id: string; role: string } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: svcHeaders });
  const prof = (await p.json().catch(() => []))?.[0];
  if (!prof || prof.is_active === false) return null;
  return { id: user.id, role: prof.role ?? '' };
}

interface Suggestion { title: string; detail: string; area: string; impact: 'high' | 'medium' | 'low'; savingPerPc: number | null }
const AREAS = ['fabric', 'material', 'stitching', 'maintenance', 'pricing', 'process', 'supplier'];
const clean = (raw: unknown): Suggestion[] => {
  const arr = Array.isArray(raw) ? raw : (raw as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 6).map((s: Record<string, unknown>) => ({
    title: String(s?.title || '').trim().slice(0, 120),
    detail: String(s?.detail || '').trim().slice(0, 600),
    area: AREAS.includes(String(s?.area)) ? String(s.area) : 'process',
    impact: (['high', 'medium', 'low'] as const).includes(s?.impact as 'high') ? (s.impact as 'high') : 'medium',
    savingPerPc: Number.isFinite(Number(s?.savingPerPc)) && Number(s?.savingPerPc) > 0 ? Math.round(Number(s.savingPerPc) * 100) / 100 : null,
  })).filter(s => s.title && s.detail);
};

const SYSTEM = `You are a garment costing consultant for an Indian ethnic-wear brand (lehengas, sarees, gowns, co-ords, kurta sets). You receive one product's EXACT computed cost stack in Indian rupees and the rule-based suggestions the app already shows.
Return ONLY JSON: {"suggestions":[{"title":string,"detail":string,"area":"fabric|material|stitching|maintenance|pricing|process|supplier","impact":"high|medium|low","savingPerPc":number|null}]}.
Rules: at most 6 suggestions; each concrete and actionable for a small workshop; use ONLY the numbers given (quote them); never invent supplier names, rates or market prices; do not repeat a rule-based suggestion — go beyond it (fabric utilisation, marker planning, alternative constructions, bundling trims, batch sizes, wastage, negotiation levers, price positioning vs the GST slab, MOQ effects); savingPerPc is your estimate in rupees per piece only when you can derive it from the given numbers, else null; plain English, no markdown.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'POST only', req);
  const body = await req.json().catch(() => null);
  if (!body || body.action !== 'suggest') return fail(400, 'Unknown action', req);
  const who = await caller(req);
  if (!who || !['admin', 'manager', 'operator'].includes(who.role)) return fail(403, 'Sign in as admin, manager or operator to use AI suggestions', req);
  const productId = String(body.productId || '').trim();
  const inputHash = String(body.inputHash || '').trim();
  if (!/^[0-9a-f-]{36}$/.test(productId) || !/^[0-9a-f]{16,64}$/.test(inputHash)) return fail(400, 'Missing product or fingerprint', req);
  const facts = body.facts && typeof body.facts === 'object' ? body.facts : null;
  if (!facts) return fail(400, 'Missing cost facts', req);
  const apiKey = await getSecret('anthropic_api_key');
  if (!apiKey) return fail(400, 'No Anthropic API key — an admin can add one in Settings → Listing AI', req);
  const model = await getModel();

  const deterministic: string[] = Array.isArray(body.deterministic) ? body.deterministic.slice(0, 10).map((s: Record<string, unknown>) => `- ${String(s?.title || '')}: ${String(s?.detail || '')}`.slice(0, 400)) : [];
  const user = `PRODUCT: ${String(facts.sku || '')} (${String(facts.category || 'no category')})\nCOST STACK (INR per piece, exact):\n${JSON.stringify(facts, null, 1).slice(0, 6000)}\n\nRULE-BASED SUGGESTIONS ALREADY SHOWN (do not repeat):\n${deterministic.join('\n') || '(none)'}\n\nGive up to 6 further cost-cutting or pricing suggestions as JSON.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1200, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }, { role: 'assistant', content: '{"suggestions":' }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) return fail(400, 'The Anthropic API key was rejected — update it in Settings → Listing AI', req);
  if (r.status === 429) return fail(429, 'Anthropic rate limit hit — wait a minute and try again', req);
  if (r.status >= 400) return fail(502, String(data?.error?.message || `Anthropic API error (${r.status})`), req);
  const text = '{"suggestions":' + (data?.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)); } catch { parsed = null; }
  const suggestions = clean(parsed);
  if (suggestions.length === 0) return fail(502, 'The model returned nothing usable — try again', req, text.slice(0, 300));

  const u = data?.usage || {};
  const usage: Usage = { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_read_input_tokens: u.cache_read_input_tokens || 0, cache_creation_input_tokens: u.cache_creation_input_tokens || 0 };
  const estUsd = estUsdOf(model, usage);

  // Replace the product's batch: old rows out, new row in (service role).
  const del = await fetch(`${SB_URL}/rest/v1/pricing_ai_suggestions?costing_product_id=eq.${productId}`, { method: 'DELETE', headers: svcHeaders });
  if (!del.ok) return fail(500, 'Could not clear the previous suggestions', req, await del.text());
  const ins = await fetch(`${SB_URL}/rest/v1/pricing_ai_suggestions`, {
    method: 'POST', headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ costing_product_id: productId, input_hash: inputHash, model, suggestions, created_by: who.id, usage, est_usd: estUsd }),
  });
  const rows = await ins.json().catch(() => []);
  if (!ins.ok || !rows?.[0]) return fail(500, 'Could not save the suggestions', req, JSON.stringify(rows).slice(0, 300));
  return json({ ok: true, row: rows[0], model, usage, estUsd }, req);
});
