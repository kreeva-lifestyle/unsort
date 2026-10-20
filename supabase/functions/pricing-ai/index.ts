// pricing-ai — evidence-based AI insights for the Price Projector.
//
// The client sends the product's EXACT computed numbers (cost stack, price,
// margin, threshold), the EVIDENCE items its engine built from the
// business's own data (purchase-order lines for the SKU, paid rates versus
// sheet rates, stitching heads that double-count sheet labour, peer
// sheets), and the rule-based suggestions it already shows. The model may
// only write up what that evidence shows: every insight must cite evidence
// ids, and anything generic — negotiation, bundling or consolidating
// suppliers, MOQ / bulk-buying advice — is refused by the prompt AND
// dropped by the validator below (the owner found such advice impractical).
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
// Claude models — the same block in listing-ai, pricing-ai, product-detail and
// buyer-spider. The owner picks the model and the effort in Settings → Listing
// AI (app_secrets listing_ai_model / listing_ai_effort); a choice saved for an
// older model moves to the same tier's current one.
// USD per million tokens: input / output / cache read (cache write = 1.25 × input).
// Haiku 5.5 costs 5× (input and output) once a prompt passes 100K tokens.
const MODELS: Record<string, { in: number; out: number; read: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, read: 0.01 },
  'claude-sonnet-5-5': { in: 2, out: 10, read: 0.2 },
  'claude-opus-5-5': { in: 4, out: 20, read: 0.2 },
};
const LEGACY_MODELS: Record<string, string> = { 'claude-haiku-4-5': 'claude-haiku-5-5', 'claude-sonnet-5': 'claude-sonnet-5-5', 'claude-opus-4-8': 'claude-opus-5-5' };
const DEFAULT_MODEL = 'claude-haiku-5-5';
// '' = the model's own default (medium on Haiku and Opus 5.5, high on Sonnet 5.5).
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const estUsdOf = (model: string, u: Usage): number => {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  const prompt = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens;
  const k = model === 'claude-haiku-5-5' && prompt > 100_000 ? 5 : 1;
  const usd = k * (u.input_tokens * p.in + u.cache_creation_input_tokens * p.in * 1.25 + u.cache_read_input_tokens * p.read + u.output_tokens * p.out) / 1e6;
  return Math.round(usd * 10000) / 10000;
};
async function getModel(): Promise<string> {
  const m = (await getSecret('listing_ai_model')) || '';
  const id = LEGACY_MODELS[m] || m;
  return MODELS[id] ? id : DEFAULT_MODEL;
}
async function getEffort(): Promise<string> {
  const e = (await getSecret('listing_ai_effort')) || '';
  return EFFORTS.includes(e) ? e : '';
}
/**
 * One Messages API request. Thinking is left to the model (adaptive — these
 * models reject turning it off; effort is the control). Opus and Sonnet get
 * the server-side refusal fallback: if the model declines, the API re-runs
 * the request on a suitable model in the same call (Haiku has none).
 * Thinking also uses max_tokens, so callers leave room above the answer.
 */
function claudeRequest(apiKey: string, model: string, effort: string, body: Record<string, unknown>, betas: string[] = []): RequestInit {
  const fallback = model !== 'claude-haiku-5-5';
  const beta = [...betas, ...(fallback ? ['server-side-fallback-2026-07-01'] : [])];
  const outputConfig = { ...((body.output_config as Record<string, unknown>) || {}), ...(effort ? { effort } : {}) };
  return {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(beta.length ? { 'anthropic-beta': beta.join(',') } : {}) },
    body: JSON.stringify({ model, ...body, ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}), ...(fallback ? { fallbacks: 'default' } : {}) }),
  };
}

async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}

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

interface Suggestion { title: string; detail: string; area: string; impact: 'high' | 'medium' | 'low'; savingPerPc: number | null; refs: string[] }
interface EvidenceIn { id: string; kind: string; title: string; detail: string; impactPerPc: number | null }
const AREAS = ['fabric', 'material', 'stitching', 'maintenance', 'pricing', 'data', 'supplier'];
// Advice the owner has ruled out as impractical for this workshop. Any
// insight that mentions one of these is dropped whatever else it says.
const FORBIDDEN = /negotiat|bargain|haggl|bundl|consolidat|\bMOQ\b|minimum order|bulk[- ]?buy|buy in bulk|volume discount|switch(ing)? supplier|alternative supplier|new supplier|source (from|elsewhere)/i;
const MAX_SUGGESTIONS = 5;

/** Keeps only insights that cite real evidence ids and avoid forbidden
 *  advice. Exported shape is what gets saved. */
const clean = (raw: unknown, evidenceIds: Set<string>): { suggestions: Suggestion[]; note: string | null; dropped: number } => {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { suggestions?: unknown; note?: unknown };
  const arr = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  let dropped = 0;
  const suggestions: Suggestion[] = [];
  for (const s of arr as Record<string, unknown>[]) {
    const title = String(s?.title || '').trim().slice(0, 120);
    const detail = String(s?.detail || '').trim().slice(0, 600);
    const refs = [...new Set((Array.isArray(s?.refs) ? s.refs : []).map(r => String(r).trim().toUpperCase()).filter(r => evidenceIds.has(r)))];
    if (!title || !detail || refs.length === 0 || FORBIDDEN.test(title + ' ' + detail)) { dropped += 1; continue; }
    suggestions.push({
      title, detail, refs,
      area: AREAS.includes(String(s?.area)) ? String(s.area) : 'data',
      impact: (['high', 'medium', 'low'] as const).includes(s?.impact as 'high') ? (s.impact as 'high') : 'medium',
      savingPerPc: Number.isFinite(Number(s?.savingPerPc)) && Number(s?.savingPerPc) > 0 ? Math.round(Number(s.savingPerPc) * 100) / 100 : null,
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  const note = typeof obj.note === 'string' && obj.note.trim() && !FORBIDDEN.test(obj.note) ? obj.note.trim().slice(0, 400) : null;
  return { suggestions, note, dropped };
};
const cleanEvidence = (raw: unknown): EvidenceIn[] => (Array.isArray(raw) ? raw : []).slice(0, 40)
  .map((e: Record<string, unknown>) => ({ id: String(e?.id || '').trim().toUpperCase(), kind: String(e?.kind || '').slice(0, 40), title: String(e?.title || '').trim().slice(0, 160), detail: String(e?.detail || '').trim().slice(0, 900), impactPerPc: Number.isFinite(Number(e?.impactPerPc)) && Number(e?.impactPerPc) > 0 ? Number(e.impactPerPc) : null }))
  .filter(e => /^E\d{1,3}$/.test(e.id) && e.title);

const SYSTEM = `You are the costing analyst of a small Indian ethnic-wear workshop (lehengas, sarees, gowns, co-ords, kurta sets). You receive one product's EXACT computed cost stack in Indian rupees, a numbered list of EVIDENCE items the app computed from the workshop's own purchase orders and costing sheets, and the rule-based suggestions the app already shows.
Your job: write up what the evidence SHOWS about this product's cost and price — nothing else.
Return ONLY JSON: {"suggestions":[{"title":string,"detail":string,"refs":["E1"],"area":"fabric|material|stitching|maintenance|pricing|data|supplier","impact":"high|medium|low","savingPerPc":number|null}],"note":string|null}.
Hard rules:
- Every suggestion must cite one or more evidence ids in refs and must only use numbers that appear in those evidence items or in the cost stack. Quote the rupee figures.
- savingPerPc is the rupee effect per piece taken from the cited evidence (impactPerPc or a difference you can show from the quoted numbers); otherwise null. Never estimate.
- NEVER suggest: negotiating or bargaining with suppliers, bundling or consolidating suppliers, switching or finding suppliers, MOQ / bulk buying / volume discounts, generic process tips, or anything phrased as "consider", "explore" or "could". These are not practical for this workshop and will be discarded.
- Do not repeat a rule-based suggestion; do not restate an evidence item without adding a conclusion the owner can act on (a specific line to fix, a rate to update, a head to exclude, a price effect).
- If the evidence supports nothing beyond what is already shown, return fewer suggestions, even an empty array, and put in note (one or two plain sentences) which data would unlock more — PO rates, the SKU on PO lines, a category on the sheet, stitching heads in Settings.
- At most ${MAX_SUGGESTIONS} suggestions; plain English; no markdown.`;

const SUGGESTION_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          refs: { type: 'array', items: { type: 'string' } },
          area: { type: 'string', enum: ['fabric', 'material', 'stitching', 'maintenance', 'pricing', 'data', 'supplier'] },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          savingPerPc: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        },
        required: ['title', 'detail', 'refs', 'area', 'impact', 'savingPerPc'],
        additionalProperties: false,
      },
    },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['suggestions', 'note'],
  additionalProperties: false,
};

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
  const evidence = cleanEvidence(body.evidence);
  if (evidence.length === 0) return fail(400, 'There is no evidence to reason over yet — add PO lines for this SKU, rates on POs, or stitching heads first', req);
  const evidenceIds = new Set(evidence.map(e => e.id));
  const apiKey = await getSecret('anthropic_api_key');
  if (!apiKey) return fail(400, 'No Anthropic API key — an admin can add one in Settings → Listing AI', req);
  const model = await getModel();

  const deterministic: string[] = Array.isArray(body.deterministic) ? body.deterministic.slice(0, 10).map((s: Record<string, unknown>) => `- ${String(s?.title || '')}: ${String(s?.detail || '')}`.slice(0, 400)) : [];
  const { evidence: _omit, ...factsForPrompt } = facts as Record<string, unknown>;
  void _omit;
  const evidenceText = evidence.map(e => `${e.id} [${e.kind}] ${e.title} — ${e.detail}${e.impactPerPc ? ` (impactPerPc ₹${e.impactPerPc})` : ''}`).join('\n');
  const user = `PRODUCT: ${String(facts.sku || '')} (${String(facts.category || 'no category')})\nCOST STACK (INR per piece, exact):\n${JSON.stringify(factsForPrompt, null, 1).slice(0, 5000)}\n\nEVIDENCE (the only facts you may build on; cite by id):\n${evidenceText.slice(0, 9000)}\n\nRULE-BASED SUGGESTIONS ALREADY SHOWN (do not repeat):\n${deterministic.join('\n') || '(none)'}\n\nWrite up to ${MAX_SUGGESTIONS} evidence-cited insights as JSON, or fewer with a note.`;
  // The JSON shape is enforced by structured output (current models do not
  // accept a pre-filled answer); max_tokens leaves room for thinking.
  const r = await fetch('https://api.anthropic.com/v1/messages', claudeRequest(apiKey, model, await getEffort(), {
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SUGGESTION_SCHEMA } },
  }));
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) return fail(400, 'The Anthropic API key was rejected — update it in Settings → Listing AI', req);
  if (r.status === 429) return fail(429, 'Anthropic rate limit hit — wait a minute and try again', req);
  if (r.status >= 400) return fail(502, String(data?.error?.message || `Anthropic API error (${r.status})`), req);
  if (data?.stop_reason === 'refusal') return fail(502, 'The AI declined this product — try again', req);
  if (data?.stop_reason === 'max_tokens') return fail(502, 'The AI answer was cut short — try again, or lower the effort in Settings → Listing AI', req);
  const text = (data?.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (parsed === null) return fail(502, 'The model returned nothing usable — try again', req, text.slice(0, 300));
  const { suggestions, note, dropped } = clean(parsed, evidenceIds);

  const u = data?.usage || {};
  const usage: Usage = { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_read_input_tokens: u.cache_read_input_tokens || 0, cache_creation_input_tokens: u.cache_creation_input_tokens || 0 };
  const estUsd = estUsdOf(model, usage);

  // Replace the product's batch: old rows out, new row in (service role).
  const del = await fetch(`${SB_URL}/rest/v1/pricing_ai_suggestions?costing_product_id=eq.${productId}`, { method: 'DELETE', headers: svcHeaders });
  if (!del.ok) return fail(500, 'Could not clear the previous suggestions', req, await del.text());
  const ins = await fetch(`${SB_URL}/rest/v1/pricing_ai_suggestions`, {
    method: 'POST', headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ costing_product_id: productId, input_hash: inputHash, model, suggestions, note, evidence, created_by: who.id, usage, est_usd: estUsd }),
  });
  const rows = await ins.json().catch(() => []);
  if (!ins.ok || !rows?.[0]) return fail(500, 'Could not save the suggestions', req, JSON.stringify(rows).slice(0, 300));
  return json({ ok: true, row: rows[0], model, usage, estUsd, dropped }, req);
});
