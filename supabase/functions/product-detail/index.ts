// product-detail — the Product Detail Generator in Rate Card Studio.
//
// The operator types a design code. This function gathers everything the
// write-up needs and asks the model for the WORDS only:
//   - the design's row in the master sheet MIRROR (master_sheet_rows, kept
//     by master-sync — no direct Sheets read): title, description, fabrics,
//     work, neck, sleeves, closure, includes, sizes, colour, and the PRICE
//     exc GST, which is never written by the model;
//   - its Dropbox photo folder (the sheet's IMAGE link, else a search of the
//     Link Generator roots), a VIEW-ONLY shared link for the "HD Images"
//     line, and up to three thumbnails the model looks at;
//   - the Anthropic call on the owner-picked model (listing_ai_model, same
//     whitelist as Listing AI), key from app_secrets — nothing secret ever
//     reaches the browser; the client only gets the finished pieces.
// The client composes the final WhatsApp text (productDetailText.ts), so the
// code, price, link and the two fixed footer links are placed by code, not
// by the model.
// Auth: signed-in admin / manager / operator.
import { getSecret, getDropboxToken, findFolder, ensureSharedLink, folderThumbs, normSku } from './dropbox.ts';

const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173'];
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
}
const json = (body: unknown, req: Request, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request, details?: string) => json({ ok: false, error, details }, req, status);

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };
// USD per million tokens (input / output) — the same table as listing-ai.
const MODELS: Record<string, { in: number; out: number }> = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-sonnet-5': { in: 3, out: 15 }, 'claude-opus-4-8': { in: 5, out: 25 } };
const DEFAULT_MODEL = 'claude-haiku-4-5';
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const estUsdOf = (model: string, u: Usage) => { const p = MODELS[model] || MODELS[DEFAULT_MODEL]; return Math.round(((u.input_tokens * p.in + u.cache_creation_input_tokens * p.in * 1.25 + u.cache_read_input_tokens * p.in * 0.1 + u.output_tokens * p.out) / 1e6) * 10000) / 10000; };
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

// ---- the master sheet mirror ----------------------------------------------
const MASTER_STALE_MS = 45 * 60_000;
const FACT_COLS = ['TITLE', 'DESCRIPTION', 'CATEGORY', 'CATALOG', 'COLOR', 'INCLUDES', 'SIZE', 'WORK TYPE', 'NECK', 'SLEEVE LENGTH', 'CLOSURE', 'TOP FABRIC', 'BOTTOM FABRIC', 'DUPATTA FABRIC', 'LEHENGA FABRIC', 'BLOUSE FABRIC', 'SAREE FABRIC', 'INNER FABRIC', 'STOCK STATUS'];
async function mirrorGet(path: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: svcHeaders });
  if (!r.ok) throw new Error(`master copy ${r.status}`);
  return await r.json();
}
/** The design's facts from the mirror: {header: value} for the non-empty
 *  cells, the PRICE exc gst as a number, the IMAGE link, and whether the
 *  copy is current. ARYA is read before DRESSTIVE, like listing-ai. */
async function masterFacts(code: string): Promise<{ tab: string; facts: Record<string, string>; price: number | null; imageLink: string; stale: boolean } | null> {
  const compact = code.replace(/[^A-Z0-9]/g, '');
  let rows = await mirrorGet(`master_sheet_rows?sku_norm=eq.${encodeURIComponent(code)}&select=tab,cells&order=tab.asc&limit=1`);
  if (rows.length === 0 && compact) rows = await mirrorGet(`master_sheet_rows?sku_compact=eq.${encodeURIComponent(compact)}&select=tab,cells&order=tab.asc&limit=1`);
  if (rows.length === 0) return null;
  const tab = String(rows[0].tab);
  const cells: string[] = (Array.isArray(rows[0].cells) ? rows[0].cells : []).map((v: unknown) => String(v ?? '').trim());
  const cols = await mirrorGet(`master_sheet_columns?tab=eq.${encodeURIComponent(tab)}&select=ordinal,header&order=ordinal.asc`);
  const facts: Record<string, string> = {};
  let price: number | null = null, imageLink = '';
  for (const c of cols) {
    const header = String(c.header ?? '').trim(); const v = cells[Number(c.ordinal)] ?? '';
    if (!header || !v) continue;
    const H = header.toUpperCase();
    if (H === 'PRICE EXC GST') { const n = Number(v.replace(/[^0-9.]/g, '')); if (Number.isFinite(n) && n > 0) price = n; }
    else if (H === 'IMAGE') imageLink = v;
    else if (FACT_COLS.includes(H)) facts[H] = v;
  }
  const sync = await mirrorGet('master_sheet_sync?select=tab,last_success_at');
  const at = sync.find((s: any) => s.tab === tab)?.last_success_at;
  return { tab, facts, price, imageLink, stale: !at || Date.now() - new Date(at).getTime() > MASTER_STALE_MS };
}

// ---- the model ------------------------------------------------------------
const SYSTEM = `You write WhatsApp product write-ups for Arya Designs, an Indian ethnic-wear label (kurta sets, lehengas, sarees, gowns, co-ords). You get one design's facts from the master sheet, its photos, and its code.
Return ONLY JSON of this exact shape:
{"title":string,"titleEmoji":string,"intro":string,"sections":[{"emoji":string,"name":string,"lines":[string]}],"setIncludes":[string],"highlights":[string]}
Rules:
- title: the garment in 3–7 words, UPPERCASE, colour first (e.g. "PISTA GREEN EMBROIDERED KURTA SET"). titleEmoji: ONE emoji matching the colour or mood.
- intro: 2–3 sentences: the occasions it suits, then the look — colour, motif, trims, sleeves, hem. Warm and specific, no hype words like "stunning" or "must-have".
- sections: one per garment piece in the set (use INCLUDES and the photos: e.g. "Kurta Details", "Pant Details", "Dupatta Details", "Blouse Details", "Lehenga Details", "Saree Details"), each with 3–8 lines in the form "Label: value" — Fabric, Embroidery/Work, Color, Silhouette, Neckline, Sleeves, Hemline, Detailing, Style, Length, Lining as they apply. One fitting emoji on some lines, never on every line. emoji: one emoji for the section heading (👗 👖 🧣 👘 🥻).
- setIncludes: the pieces, one word or two each ("Kurta", "Pant", "Dupatta").
- highlights: 4–6 short lines, each ending with ONE emoji: occasions first, then the colour, the work, the trims.
- The sheet is the truth for fabric names, includes, sizes, work type, neck, sleeves and closure — use its wording; the photos decide colour names, motifs, piping, lace and other details you can SEE. If the photos show something the sheet does not list, you may describe it; never contradict the sheet.
- No prices, discounts, offers, delivery promises or links — those are added by the app. No markdown, no asterisks, no hashtags, no quotation marks inside values. British/Indian English.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'POST only', req);
  const body = await req.json().catch(() => null);
  if (!body || body.action !== 'generate') return fail(400, 'Unknown action', req);
  const who = await caller(req);
  if (!who || !['admin', 'manager', 'operator'].includes(who.role)) return fail(403, 'Sign in as admin, manager or operator to generate product details', req);
  const code = normSku(body.code);
  if (!code || code.length > 40) return fail(400, 'Enter a design code', req);
  const apiKey = await getSecret('anthropic_api_key');
  if (!apiKey) return fail(400, 'No Anthropic API key — an admin can add one in Settings → Listing AI', req);
  const warnings: string[] = [];

  let master: Awaited<ReturnType<typeof masterFacts>> = null;
  try { master = await masterFacts(code); } catch (e) { warnings.push(`Master sheet copy unavailable (${(e as Error).message}) — written from the photos only`); }
  if (!master) warnings.push(`${code} is not in the master sheet — no price, written from the photos only`);
  else if (master.stale) warnings.push('The master sheet copy is more than 45 minutes old — check the master sync');

  // Dropbox: folder → view-only link + thumbnails. Not having Dropbox is a
  // warning, not a failure: the sheet alone can still carry a write-up.
  let hdLink = '', folder = '';
  const images: { name: string; b64: string }[] = [];
  try {
    const token = await getDropboxToken();
    const found = await findFolder(token, code, master?.imageLink || '');
    if (found.note) warnings.push(found.note);
    if (found.folder) {
      folder = found.folder.path_display;
      if (found.url) hdLink = found.url;
      else { const mk = await ensureSharedLink(token, found.folder.path_lower); if (mk.url) hdLink = mk.url; else warnings.push(mk.error || 'Could not create the Dropbox link'); }
      images.push(...await folderThumbs(token, found.folder, 3));
      if (images.length === 0) warnings.push(`No photos directly inside ${folder}`);
    }
  } catch (e) {
    warnings.push((e as Error).message === 'dropbox_not_connected' ? 'Dropbox is not connected — an admin can connect it in Trackly → Image Link Check' : `Dropbox: ${(e as Error).message}`);
  }
  if (!master && images.length === 0) return json({ ok: false, error: `Nothing to write from: ${code} is not in the master sheet and no Dropbox photos were found`, warnings }, req, 404);

  const factsText = master ? Object.entries(master.facts).map(([k, v]) => `${k}: ${v}`).join('\n') : '(not in the master sheet)';
  const content: any[] = [{ type: 'text', text: `DESIGN CODE: ${code}\nBRAND: ${master?.tab === 'ARYA' ? 'ARYA' : master?.tab === 'DRESSTIVE' ? 'DRESSTIVE' : 'Arya Designs'}\n\nMASTER SHEET FACTS:\n${factsText}\n\n${images.length ? `PHOTOS (${images.length}) follow.` : 'No photos available — describe only what the facts support.'}` }];
  for (const im of images) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.b64 } });
  const model = await getModel();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1500, system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }, { role: 'assistant', content: '{"title":' }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) return fail(400, 'The Anthropic API key was rejected — update it in Settings → Listing AI', req);
  if (r.status === 429) return fail(429, 'Anthropic rate limit hit — wait a minute and try again', req);
  if (r.status >= 400) return fail(502, String(data?.error?.message || `Anthropic API error (${r.status})`), req);
  const text = '{"title":' + (data?.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim();
  let parsed: any = null;
  try { parsed = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)); } catch { parsed = null; }
  if (!parsed || typeof parsed !== 'object') return fail(502, 'The model returned nothing usable — try again', req, text.slice(0, 300));

  // Only strings of bounded length reach the client; asterisks would break
  // WhatsApp's bold markers that the composer adds itself.
  const s = (v: unknown, max: number) => String(v ?? '').replace(/[*_~`"]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v : []).map(x => s(x, each)).filter(Boolean).slice(0, max);
  const detail = {
    title: s(parsed.title, 80).toUpperCase() || code,
    titleEmoji: s(parsed.titleEmoji, 8) || '✨',
    intro: s(parsed.intro, 700),
    sections: (Array.isArray(parsed.sections) ? parsed.sections : []).slice(0, 5).map((sec: any) => ({ emoji: s(sec?.emoji, 8) || '👗', name: s(sec?.name, 40) || 'Details', lines: list(sec?.lines, 10, 160) })).filter((sec: any) => sec.lines.length),
    setIncludes: list(parsed.setIncludes, 6, 30),
    highlights: list(parsed.highlights, 6, 120),
  };
  const u = data?.usage || {};
  const usage: Usage = { input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0, cache_read_input_tokens: u.cache_read_input_tokens || 0, cache_creation_input_tokens: u.cache_creation_input_tokens || 0 };
  return json({ ok: true, code, detail, price: master?.price ?? null, hdLink, folder, images, sheet: master ? { tab: master.tab, title: master.facts.TITLE || '', category: master.facts.CATEGORY || '', color: master.facts.COLOR || '', includes: master.facts.INCLUDES || '' } : null, warnings, model, usage, estUsd: estUsdOf(model, usage) }, req);
});
