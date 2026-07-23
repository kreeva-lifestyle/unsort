// listing-ai Edge Function - AI Listing Module backend (v27).
//
// v27: `ratecard_rows` action for RateCard Studio's From-Master mode.
// Given SKUs it returns each one's master row (values keyed by the
// uppercased header) plus its detected garment category, and the union
// of non-empty columns - the client builds the rate card from that and
// enforces the one-category-per-card rule. Free: cached master read,
// zero AI tokens.
//
// v26: pre-AI category validation. New free `validate` action checks each
// pasted SKU's master-row text against the template's garment category
// (saved category or auto-detected from the template name) so a wrong-
// template paste (Kurta Set SKUs into a Lehenga template) is caught
// BEFORE any Anthropic spend. `generate` gets the same guard server-side:
// mismatched SKUs come back status 'category_mismatch' without touching
// Dropbox or the AI, unless the client passes force:true (the owner's
// explicit 'Run anyway').
//
// v25: fix v24's asciiArg regression. Array.from iterates code POINTS, so
// astral chars (emoji) in Dropbox paths lost their low surrogate and the
// thumbnail path was corrupted (photo silently missing for emoji-named
// folders). Now an indexed per-code-unit loop, byte-identical to the
// original regex behaviour.
//
// v24: taught-mappings 20k cap no longer drops lessons silently. When the
// listing_mappings table exceeds the 20,000-row fetch cap, the oldest
// lessons stop applying - fetchAllMappings now flags that via warnings
// (surfaced in generate + scan_mappings) so the owner knows to trim ignored
// mappings. Mappings stay UNcached (unlike the master sheet) - they're
// edited in-app and a teach->regenerate loop must see the change at once.
// Also: asciiArg is now a char-code map (was a high-range regex with raw
// control bytes) so the source is pure ASCII - identical at runtime, but
// removes an invisible byte that corrupted earlier deploys.
//
// v23: the master sheet is cached in the isolate for 60s. A 60-SKU run
// chunks into ~20 edge calls that each re-downloaded both master tabs (40
// full reads); consecutive chunks on a warm isolate now share one read.
// Only a complete, error-free read is cached; a master edit shows within a
// minute.
//
// v22: three size/pairing correctness fixes. (1) masterVal now matches the
// master column by NORMALIZED header, so a header spelled differently on the
// two tabs ("Top Fabric" vs "Top-Fabric") no longer reads '' for a whole
// brand. (2) EVERY template column paired to the master SIZE expands per size
// (was only the first), each resolved to its own dropdown. (3) Wired copies
// are applied per output ROW inside finalizeRow, so a column wired to a
// per-size-chart column gets that row's charted value instead of a stale one.
//
// v20: a rule SET no longer fills an owner-SKIPPED column - the owner's
// "skip" (exported empty) wins over a rule that happens to target it.
// Price-like blank columns are not skipped, so rules still fill those.
//
// v19: all-sizes-skipped rows are finalized before export. When every size
// of a multi-size SKU fails to resolve, the fallback row now runs through
// finalizeRow (placeholders + charts) with a blank size cell, so it can no
// longer export literal {today}/{sku} tokens or the joined "XS, S, M" line
// as a finished row.
//
// v18: price/HSN columns unlocked - owner-controlled, never AI-written.
// SENSITIVE headers are no longer force-blanked: fixed values, master
// pairing, wires and rules fill them like any other column. The AI path
// stays closed - an unset price column exports empty, and price fields
// never enter the AI schema or prompt, so the model can't invent an MRP.
//
// v17: correctness fixes. (1) The prompt now infers stitch type from the
// sizes - discrete ready-to-wear sizes (XS..XXL or numeric) mean a fully
// stitched garment, so the model stops defaulting lehengas to "semi-
// stitched" and inventing closures / drawstrings the master data never
// stated. (2) New {today} / {date} token: a fixed value of {today} stamps
// the current IST date (YYYY-MM-DD) instead of asking the clock-less AI,
// which hallucinates a training-era date. (3) applyWired now defers canon
// on placeholder values (parity with applyRules / applyCharts) so a wired
// copy of a "{sku}-{size}" pattern is never dropped as out-of-list.
//
// v16: {sku} / {size} / {brand} placeholders. Any typed value - a fixed
// value, a rule SET value, a size-chart value - may carry placeholders,
// resolved PER OUTPUT ROW after size expansion. "{sku}-{size}" in a child
// code column becomes XYZ-XS on the XS row, XYZ-S on the S row... while
// "{sku}" keeps the parent code (Myntra styleId / styleGroupId pattern) -
// works on any sheet, composable with rules (e.g. semi-stitched products
// can SET the child column to plain "{sku}"). When a part is empty (no
// size on the row) the leftover joiners are tidied ("XYZ-" -> "XYZ").
// Substituted values in dropdown columns still pass canon.
// v15: owner-defined conditional rules + per-size charts.
// listing_templates.rules holds template-level rules: WHEN a master-sheet
// column or a template column's computed value matches (is/contains) - or
// always - SET target columns to fixed values, or to per-size values (size
// charts) applied during row expansion. Semi-stitched vs stitched products
// can now fill measurement/closure columns differently without touching the
// AI: rules run in code AFTER base values (so they overwrite the AI's pick -
// owner rules always win) and BEFORE wired copies (wires propagate ruled
// values). Every rule target is canon-validated against its own dropdown, so
// a rule can never smuggle a non-marketplace value into a locked column.
// v14: owner-controlled master pairing + scan visibility.
// - A template field may carry `masterAs: "<master header>"` - the owner's
//   explicit pairing to a master-sheet column, set in the template editor.
//   It wins over the built-in DIRECT_MAP/same-name pairing and flows through
//   generation, taught mappings, size expansion and the Bulk Teach scan.
// - New `master_columns` action returns the live master header list (feeds
//   the pairing select - new sheet columns appear with zero code changes).
// - scan_mappings also returns settled values (autoValues + taughtValues,
//   capped 150 each) so the Bulk Teach board can SHOW what matched/was
//   taught instead of hiding everything once settled.
// - DIRECT_MAP learns the unambiguous colour headers (Prominent Colour,
//   Brand Colour) -> master COLOR.
// v13: size expansion. The master sheet stores every size of a style in ONE
// cell ("XS, S, M, L, XL, XXL") while marketplaces like Myntra accept only
// individual sizes and expect one row per size (styleGroupId ties them).
// A comma SIZE value now resolves per-token (canon + taught, zero AI) and
// the SKU's row EXPANDS into one otherwise-identical row per resolved size;
// unknown sizes are skipped with a note, never exported invalid. Single
// values (e.g. "SEMI-STITCHED UPTO 42BUST") keep the old path - taught
// lessons like "-> Onesize" still apply. scan_mappings counts the individual
// sizes instead of the joined line, so Bulk Teach stops listing it.
// v12: owner-selectable model + cost visibility + cache checkup.
// The model is no longer hardcoded: `listing_ai_model` in app_secrets picks
// haiku/sonnet/opus (new `set_model` action, admin only; default Haiku 4.5 -
// the cheapest tier, 5x cheaper than Opus). Every generate/suggest response
// now carries `estUsd` + `cacheSavedUsd` so the client can show real money
// instead of token counts. suggest_mappings is PINNED to Haiku regardless of
// the picker - its outputs are canon-validated so the cheap model is safe.
// Cache diagnostics (beta cache-diagnosis-2026-04-07): the client threads the
// previous chunk's message id through `prevMessageId`; a *_changed
// cache_miss_reason (except messages_changed, which is expected because each
// chunk carries different SKUs while the cached SYSTEM prefix still hits)
// comes back as a plain-language `cacheNote` warning.
// v11: bulk teaching. New `scan_mappings` action (free, deterministic):
// reads every distinct master-sheet value per template dropdown column and
// buckets it exactly as a run would resolve it (auto / taught / ignored /
// stale / unmatched) so the owner can teach lessons in bulk instead of one
// by one. New `suggest_mappings` action (explicit ask only): ONE batched AI
// call proposes an allowed value per unmatched master value, every proposal
// canon-validated server-side - an out-of-list suggestion can never surface.
// Scale fixes shipped with it: the taught-mappings fetch now PAGINATES past
// PostgREST's 1000-row page (lessons used to silently stop applying),
// `ignored` lessons are skipped everywhere, and prompt precedent now picks
// the current template's columns first (newest lessons first) instead of
// the first 300 alphabetically. This file is the source of truth - deploy
// from the repo, don't edit the deployed copy.
// v10: wired columns. A template field may carry `sameAs: "<header>"` - the
// column copies another column's FINAL value in code (one hop, validated
// against its own dropdown list), zero AI cost. For marketplace sheets that
// repeat the same data under 2-3 different column names.
// v9: audit hardening. max_tokens scales with schema width (a 70-column
// template overflowed the old flat budget); SKU folders inside Image
// Folders are found by DIRECT path lookup first (Dropbox search indexing
// lags for freshly uploaded folders); canon matching gains a compact tier
// (space/punctuation-insensitive) so "One Size" resolves to "Onesize"
// deterministically instead of blanking or burning AI tokens.
//
// v8: big-template fix. Structured-output enums are budgeted (per-field cap
// + total cap, largest lists demoted to plain strings) because the API
// compiles enums into a decoding grammar with a hard size limit - a
// 93-column Myntra sheet with 5x249-value country lists exceeded it
// ("compiled grammar is too large"). Demoted fields get prompt guidance and
// SERVER-SIDE post-validation (canon against the list; miss -> empty + row
// note), so only marketplace values can still ever appear. If the API still
// rejects the schema, one retry runs without the strict format.
// v7: owner feedback - links are NOT saved per SKU. Owner-saved Image
// Folders (listing_folders: the parent folders containing every SKU's
// subfolder) are searched FIRST; template fields may carry `skip` (column is
// never filled - exported empty, zero cost). Photo priority: typed one-off
// link -> Image Folders -> master IMAGE column link -> Link Generator roots.
// v5: taught mappings (listing_mappings) applied in code; deterministic
// mapped fields leave the AI schema; lessons shown as precedent. Free-text
// template columns matching a master column copy OUR value (creative fields
// stay AI-written).
// v4: items [{sku, link?}]; image-slot columns filled with ordered raw=
// share links; garment-logic + trade-fabric prompt rules.
// v3: `fixed` values filled in code at zero cost.
// v2: `allowed` datasets -> enum-constrained structured output.
//
// Actions (POST JSON { action, ... }, caller role checked via profiles.role):
//   status           (signed-in)     -> { ok, hasKey, role, model }
//   set_key          (admin)         -> store / clear the Anthropic API key (vault)
//   set_model        (admin)         -> pick the generation model (whitelist)
//   generate         (admin/manager) -> fill a marketplace template for up to 5 SKUs
//   master_columns   (admin/manager) -> live master-sheet header list (pairing UI)
//   scan_mappings    (admin/manager) -> distinct master values per dropdown column,
//                                       bucketed auto/taught/ignored/stale/unmatched
//   suggest_mappings (admin/manager) -> one AI call proposing allowed values for
//                                       unmatched master values (canon-validated)
//
// The Anthropic API key lives in app_secrets (service-role only) - never in
// the browser. Google + Dropbox credentials are the same ones odette-export
// already uses.

// deno-lint-ignore-file no-explicit-any

// Whitelisted models + per-MTok USD pricing (cache write 1.25x in, read 0.1x).
// Sonnet 5 has an intro price ($2/$10) through 2026-08-31 - we bill-estimate
// at the sticker price so the shown cost is never an underestimate.
const MODELS: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-opus-4-8': { in: 5, out: 25 },
};
const DEFAULT_MODEL = 'claude-haiku-4-5'; // cheapest tier - owner's pick
const SUGGEST_MODEL = 'claude-haiku-4-5'; // suggestions are canon-validated, cheap is safe
const SKU_CAP = 5;
// validate covers a whole run in ONE call (no AI, master read is cached).
const VALIDATE_CAP = 60;
// ratecard_rows serves the Rate Card builder - bigger cap, still one call.
const RATECARD_CAP = 200;

interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

const estUsdOf = (model: string, u: Usage): number => {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  const usd = (u.input_tokens * p.in + u.cache_creation_input_tokens * p.in * 1.25 + u.cache_read_input_tokens * p.in * 0.1 + u.output_tokens * p.out) / 1e6;
  return Math.round(usd * 10000) / 10000;
};

// What the prompt cache saved vs paying full price for those tokens (~90%).
const cacheSavedUsdOf = (model: string, u: Usage): number => {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  return Math.round((u.cache_read_input_tokens * p.in * 0.9 / 1e6) * 10000) / 10000;
};

const ALLOWED_ORIGINS = [
  'https://dailyoffice.aryadesigns.co.in',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

const fail = (status: number, error: string, req: Request, details?: string) =>
  json({ ok: false, error, details }, req, status);

// Escape every non-ASCII CODE UNIT (charCode > 126) for Dropbox-API-Arg
// headers. Indexed loop, NOT Array.from: Array.from iterates code POINTS,
// so an astral char (emoji) arrived as one two-unit string and only its
// high surrogate was emitted - corrupting emoji-bearing Dropbox paths (the
// v24 bug). Source stays pure ASCII (no unicode-escape literals - they
// round-trip badly when redeployed as an inline JSON string).
const asciiArg = (o: unknown) => {
  const s = JSON.stringify(o);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    out += cc > 126 ? '\\u' + cc.toString(16).padStart(4, '0') : s[i];
  }
  return out;
};

function pemToDer(pem: string): Uint8Array {
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
  const body = normalized.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(input: Uint8Array | string): string {
  const bin = typeof input === 'string' ? input : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getGoogleToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const email = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  const pkRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  if (!email) throw new Error('Missing GOOGLE_CLIENT_EMAIL secret');
  if (!pkRaw) throw new Error('Missing GOOGLE_PRIVATE_KEY secret');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pkRaw), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth ${resp.status}: ${data.error_description || data.error || 'unknown'}`);
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

function getMasterSheetId(): string {
  const id = Deno.env.get('MASTER_SHEET_ID');
  if (!id) throw new Error('Missing MASTER_SHEET_ID secret');
  return id;
}

const MASTER_TABS = ['ARYA', 'DRESSTIVE'];

// Garment-category taxonomy - the ONLY place keywords live (the client holds
// ids+labels for display only). PRIORITY ORDER: first match wins, so set-type
// phrases come before their component words ("kurta set" before "kurta"; a
// kurta-set row that mentions its dupatta must NOT detect as dupatta).
// Word-boundary regexes: "dress" must not match the DRESSTIVE brand name.
const CATEGORIES: { id: string; label: string; res: RegExp[] }[] = [
  { id: 'kurta-set',     label: 'Kurta Set',     res: [/\bkurta\s*sets?\b/, /\bkurta\s+with\b/, /\bsuit\s*sets?\b/] },
  { id: 'lehenga-choli', label: 'Lehenga Choli', res: [/\blah?enga\b/, /\bghagra\b/, /\bcholi\b/] },
  { id: 'sharara',       label: 'Sharara Set',   res: [/\bsharara\b/, /\bgharara\b/] },
  { id: 'palazzo',       label: 'Palazzo Set',   res: [/\bpalazz?o\b/] },
  { id: 'anarkali',      label: 'Anarkali',      res: [/\banarkali\b/] },
  { id: 'coord',         label: 'Co-ord Set',    res: [/\bco-?\s?ords?\b/] },
  { id: 'saree',         label: 'Saree',         res: [/\bsarees?\b/, /\bsaris?\b/] },
  { id: 'gown',          label: 'Gown',          res: [/\bgowns?\b/] },
  { id: 'kurta',         label: 'Kurta / Kurti', res: [/\bkurtas?\b/, /\bkurtis?\b/] },
  { id: 'dress',         label: 'Dress',         res: [/\bdress(es)?\b/] },
  { id: 'dupatta',       label: 'Dupatta',       res: [/\bdupatt?a\b/, /\bchunni\b/, /\bodhni\b/] },
];
// Detected X is ACCEPTABLE for a template of category Y (no warning) -
// marketplaces commonly file sharara/palazzo/anarkali sets under kurta sets.
const CAT_COMPAT: Record<string, string[]> = {
  'kurta-set': ['sharara', 'palazzo', 'anarkali', 'kurta'],
  'anarkali': ['kurta-set', 'gown'],
  'kurta': ['kurta-set'],
  'sharara': ['kurta-set'],
  'palazzo': ['kurta-set'],
};
const detectCategory = (text: string): string | null => {
  const t = String(text || '').toLowerCase();
  for (const c of CATEGORIES) if (c.res.some(re => re.test(t))) return c.id;
  return null;
};
const catLabel = (id: string | null) => CATEGORIES.find(c => c.id === id)?.label ?? null;
const catCompatible = (tplCat: string, detected: string) =>
  tplCat === detected || (CAT_COMPAT[tplCat] || []).includes(detected);

const normSku = (v: unknown) => String(v ?? '').trim().toUpperCase();

function nameMatchesSku(rawName: string, sku: string): boolean {
  const name = normSku(rawName).replace(/\.[A-Z0-9]+$/i, '');
  if (!name || !sku) return false;
  if (name === sku) return true;
  if (name.startsWith(sku) && !/[A-Z0-9]/.test(name.charAt(sku.length))) return true;
  return false;
}

async function readSheetRaw(sheetId: string, tab: string): Promise<string[][]> {
  const token = await getGoogleToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tab)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error?.message || `read ${r.status}`);
  return (data.values || []) as string[][];
}

function skuColIndex(headers: string[]): number {
  const i = headers.findIndex(h => String(h ?? '').toLowerCase().includes('sku'));
  return i < 0 ? 0 : i;
}

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` };

async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}

// Active generation model: owner-picked via set_model, defaults to the
// cheapest tier. Unknown/stale stored values fall back to the default.
async function getModel(): Promise<string> {
  const m = (await getSecret('listing_ai_model')) || '';
  return MODELS[m] ? m : DEFAULT_MODEL;
}

async function setSecret(key: string, value: string): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets`, {
    method: 'POST',
    headers: { ...svcHeaders, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`secret store ${r.status}`);
}

async function callerRole(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null);
  if (!user?.id) return null;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: svcHeaders });
  const rows = await p.json().catch(() => []);
  const prof = rows?.[0];
  if (!prof || prof.is_active === false) return null;
  return prof.role ?? null;
}

// Taught mappings: PAGINATED past PostgREST's 1000-row page - with bulk
// teaching the table can easily exceed one page, and lessons past it used
// to silently stop applying. Newest first so downstream caps keep the most
// recently taught lessons. NOT cached across calls (unlike the master
// sheet): mappings are edited client-side and a teach->regenerate loop
// expects the new lesson to apply immediately, so we always read fresh.
interface MappingRow { field_key: string; field_label: string; source: string; target: string; ignored: boolean; updated_at: string }

const MAPPINGS_CAP = 20_000;

// warnings (optional): when the table exceeds MAPPINGS_CAP we stop paging to
// bound the request, but the DROPPED lessons would otherwise vanish with no
// signal - push a warning so the owner knows to trim ignored mappings.
async function fetchAllMappings(warnings?: string[]): Promise<MappingRow[]> {
  const out: MappingRow[] = [];
  const PAGE = 1000;
  let capped = false;
  for (let offset = 0; offset < MAPPINGS_CAP; offset += PAGE) {
    const r = await fetch(`${SB_URL}/rest/v1/listing_mappings?select=field_key,field_label,source,target,ignored,updated_at&order=updated_at.desc&limit=${PAGE}&offset=${offset}`, { headers: svcHeaders });
    if (!r.ok) break;
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    if (offset + PAGE >= MAPPINGS_CAP) capped = true; // a full final page => more remain
  }
  if (capped) warnings?.push(`Only the ${MAPPINGS_CAP.toLocaleString()} most-recently-taught mappings were applied; older lessons were skipped. Delete unused/ignored mappings to stay under the limit.`);
  return out;
}

let dbxCache: { token: string; expiresAt: number; rt: string } | null = null;

async function getDropboxToken(): Promise<string> {
  const [rt, ck, cs] = await Promise.all([getSecret('dropbox_refresh_token'), getSecret('dropbox_app_key'), getSecret('dropbox_app_secret')]);
  if (!rt) throw new Error('dropbox_not_connected');
  if (dbxCache && dbxCache.rt === rt && dbxCache.expiresAt > Date.now() + 60_000) return dbxCache.token;
  if (!ck || !cs) throw new Error('Dropbox app credentials missing from vault');
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: ck, client_secret: cs }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Dropbox token ${r.status}: ${data.error_description || data.error || 'unknown'}`);
  dbxCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 14000) * 1000, rt };
  return dbxCache.token;
}

async function dbx(token: string, endpoint: string, body: unknown): Promise<{ status: number; data: any }> {
  const r = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// Same 10-minute TTL cache as odette's linkgen: moved/renamed Dropbox folders
// keep their shared URL but change path_lower.
const ROOT_TTL_MS = 10 * 60 * 1000;
const genRootCache: Record<string, { p: string; at: number }> = {};

async function resolveImageRoots(token: string): Promise<string[]> {
  const raw = await getSecret('dropbox_linkgen_roots');
  let roots: { url: string; enabled?: boolean }[] = [];
  try { const arr = raw ? JSON.parse(raw) : []; roots = Array.isArray(arr) ? arr : []; } catch { roots = []; }
  const paths: string[] = [];
  for (const r of roots.filter(r => r.enabled !== false && r.url)) {
    const hit = genRootCache[r.url];
    let p = hit && Date.now() - hit.at < ROOT_TTL_MS ? hit.p : '';
    if (!p) {
      const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: r.url });
      p = meta.data?.path_lower || '';
      if (meta.status >= 400 || !p) { delete genRootCache[r.url]; continue; }
      genRootCache[r.url] = { p, at: Date.now() };
    }
    paths.push(p);
  }
  return paths;
}

// One small JPEG per SKU: first image of the folder. w640h480 bestfit keeps
// it detailed enough to judge work/pattern at ~500 tokens.
async function thumbB64(token: string, path: string): Promise<string | null> {
  const r = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ resource: { '.tag': 'path', path }, format: 'jpeg', size: 'w640h480', mode: 'bestfit' }) },
  });
  if (!r.ok) { try { await r.body?.cancel(); } catch { /* consumed */ } return null; }
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const IMG_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

const sortedImagePaths = (entries: any[]): string[] =>
  entries
    .filter((e: any) => e['.tag'] === 'file' && IMG_RE.test(e.name))
    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))
    .map((e: any) => e.path_lower);

// Auto-search: folder named exactly like the SKU inside the configured
// roots -> its images in filename order; fallback to a loose matching file.
// A direct child lookup runs FIRST: Dropbox's search index lags minutes
// behind for freshly uploaded folders, but get_metadata on the exact path
// (parent/SKU) is index-free - new products work immediately.
async function findSkuImagePaths(token: string, rootPaths: string[], sku: string): Promise<string[]> {
  for (const rootPath of rootPaths) {
    const direct = await dbx(token, 'files/get_metadata', { path: `${rootPath}/${sku.toLowerCase()}` });
    if (direct.status < 300 && direct.data?.['.tag'] === 'folder') {
      const ls = await dbx(token, 'files/list_folder', { path: direct.data.path_lower, limit: 100 });
      if (ls.status < 300) {
        const paths = sortedImagePaths(ls.data.entries || []);
        if (paths.length) return paths;
      }
    }
  }
  for (const rootPath of rootPaths) {
    const sr = await dbx(token, 'files/search_v2', { query: sku, options: { path: rootPath, max_results: 10, filename_only: true } });
    if (sr.status >= 400) continue;
    const metas = (sr.data.matches || []).map((m: any) => m.metadata?.metadata).filter(Boolean);
    const folders = metas.filter((md: any) => md['.tag'] === 'folder' && normSku(md.name) === sku);
    for (const f of folders) {
      const ls = await dbx(token, 'files/list_folder', { path: f.path_lower, limit: 100 });
      if (ls.status >= 400) continue;
      const paths = sortedImagePaths(ls.data.entries || []);
      if (paths.length) return paths;
    }
    const files = metas.filter((md: any) => md['.tag'] === 'file' && IMG_RE.test(md.name) && nameMatchesSku(md.name, sku));
    if (files.length) return [files[0].path_lower];
  }
  return [];
}

// Explicit per-SKU link: a folder link lists its images; a file link is a
// single image. null = link unusable.
async function resolveLinkImages(token: string, link: string): Promise<string[] | null> {
  if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(link)) return null;
  const meta = await dbx(token, 'sharing/get_shared_link_metadata', { url: link });
  if (meta.status >= 400 || !meta.data?.path_lower) return null;
  if (meta.data['.tag'] === 'folder') {
    const ls = await dbx(token, 'files/list_folder', { path: meta.data.path_lower, limit: 100 });
    if (ls.status >= 400) return null;
    return sortedImagePaths(ls.data.entries || []);
  }
  return IMG_RE.test(String(meta.data.name || '')) ? [meta.data.path_lower] : null;
}

// Same battle-tested share-link creation as odette's linkgen.
async function ensureSharedLink(token: string, path: string): Promise<{ url?: string; error?: string; needsReconnect?: boolean; rateLimited?: boolean }> {
  const ll = await dbx(token, 'sharing/list_shared_links', { path, direct_only: true });
  if (ll.status === 429) return { error: 'Rate limited - try again in a minute', rateLimited: true };
  if (ll.status < 300) { const url = ll.data?.links?.[0]?.url || ''; if (url) return { url }; }
  let cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path, settings: { audience: 'public', access: 'viewer', allow_download: true } });
  if (cl.status === 429) return { error: 'Rate limited - try again in a minute', rateLimited: true };
  if (cl.status === 409 && String(cl.data?.error_summary || '').includes('shared_link_already_exists')) {
    const url = cl.data?.error?.shared_link_already_exists?.metadata?.url || ''; if (url) return { url };
  } else if (cl.status === 409 && String(cl.data?.error_summary || '').includes('settings_error')) {
    cl = await dbx(token, 'sharing/create_shared_link_with_settings', { path }); if (cl.data?.url) return { url: cl.data.url };
  } else if (cl.status === 401 || String(cl.data?.error_summary || '').includes('missing_scope')) {
    return { error: 'Dropbox needs the sharing.write permission - reconnect', needsReconnect: true };
  } else if (cl.status < 300 && cl.data?.url) { return { url: cl.data.url }; }
  return { error: `Could not create share link (${cl.status})` };
}

// Marketplace image columns need a URL that serves the image bytes directly.
const rawUrl = (url: string) =>
  /[?&]dl=0/.test(url) ? url.replace(/([?&])dl=0/, '$1raw=1') : url + (url.includes('?') ? '&' : '?') + 'raw=1';

// ---- field classification ------------------------------------------------
// Price-like columns are never AI-written: the owner fills them via fixed
// values, master pairing, wires or rules - with no deterministic source they
// export empty. The model never sees a price field, so it can't invent one.
const SENSITIVE_RE = /price|mrp|\bgst\b|\brate\b|cost|amount|margin|commission|\bhsn\b/i;
// Master columns that never help the model (links, stock dates, prices).
const EXCLUDE_SRC = /price|gst|image|out of stock/i;

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

// Template header -> master column, only for unambiguous 1:1 matches.
const DIRECT_MAP: [RegExp, string][] = [
  [/^(sku|skuid|skucode|sellersku|sellerskuid|vendorsku|vendorskucode|stylecode|styleid|designno|designnumber|productid|productcode|itemsku)$/, 'SKU'],
  [/^(colou?r|primarycolou?r|colou?rfamily|prominentcolou?r|brandcolou?rremarks|brandcolou?r)$/, 'COLOR'],
  [/^(size|sizename|standardsize)$/, 'SIZE'],
  [/^(neck|neckline|necktype)$/, 'NECK'],
  [/^(sleeve|sleevelength|sleevetype|sleevestyling)$/, 'SLEEVE LENGTH'],
  [/^(closure|closuretype)$/, 'CLOSURE'],
  [/^(work|worktype|workdetail)$/, 'WORK TYPE'],
  [/^(topfabric|topmaterial)$/, 'TOP FABRIC'],
  [/^(bottomfabric|bottommaterial)$/, 'BOTTOM FABRIC'],
  [/^(dupattafabric|dupattamaterial)$/, 'DUPATTA FABRIC'],
  [/^(blousefabric|blousematerial)$/, 'BLOUSE FABRIC'],
  [/^(sareefabric|sareematerial)$/, 'SAREE FABRIC'],
  [/^(lehengafabric|lehengamaterial)$/, 'LEHENGA FABRIC'],
  [/^(innerfabric|lining|liningfabric|liningmaterial)$/, 'INNER FABRIC'],
];

// Marketplace image-slot columns (Front Image, Side Image, Additional Image
// 1...): filled with ordered Dropbox share links, never by the AI. Document
// URLs like "BIS Certificate Image URL" must NOT get product photos.
const IMAGE_COL_RE = /(front|side|back|additional)\s*image|image\s*\d|look\s*shot|detail\s*angle/i;
const NOT_IMAGE_COL_RE = /certificate|\bbis\b|document/i;

// Creative fields stay AI-written even when a same-named master column
// exists - copying DESCRIPTION verbatim across marketplaces is exactly the
// duplicate-content problem the module exists to avoid.
const CONTENT_RE = /title|description|display\s*name|style\s*note|style\s*tip|tag|keyword|detail/i;

interface TplField { header: string; mandatory: boolean; hint: string; allowed: string[]; fixed: string; skip: boolean; sameAs: string; masterAs: string }
// For kind 'wired', masterCol holds the SOURCE template header, not a master
// sheet column.
type Classified = TplField & { kind: 'blank' | 'image' | 'fixed' | 'wired' | 'brand' | 'direct' | 'ai'; masterCol: string };

// Match against a field's allowed list -> the list's canonical spelling.
// Tier 1: exact case-insensitive ("teal" -> "Teal"). Tier 2: compact,
// ignoring spaces/punctuation ("One Size" -> "Onesize", "V Neck" ->
// "V-Neck"). Membership never loosens - only the list's own values return.
const canon = (f: { allowed: string[] }, v: string): string | undefined => {
  const lv = v.trim().toLowerCase();
  const exact = f.allowed.find(a => a.toLowerCase() === lv);
  if (exact) return exact;
  const cv = normHeader(v);
  return cv ? f.allowed.find(a => normHeader(a) === cv) : undefined;
};

// A master SIZE cell may list every size of the style in one line
// ("XS, S, M, L, XL, XXL"). Tokens drive one-row-per-size expansion and
// per-size counting in the Bulk Teach scan. [] = not a multi-size value.
const sizeTokens = (raw: string): string[] =>
  raw.includes(',') ? [...new Set(raw.split(',').map(t => t.trim()).filter(Boolean))] : [];

// The template column a size expansion targets: paired to the master SIZE
// column AND locked to a dropdown (free-text size columns keep the joined
// line - e.g. Shopify - and never expand).
const isSizeField = (f: Classified) => f.kind === 'direct' && f.masterCol === 'SIZE' && f.allowed.length > 0;

function classifyFields(fields: TplField[], masterHeaders: Map<string, string>): Classified[] {
  return fields.map(f => {
    // Owner-skipped columns are never filled - exported empty, zero cost.
    if (f.skip) return { ...f, kind: 'blank' as const, masterCol: '' };
    if (IMAGE_COL_RE.test(f.header) && !NOT_IMAGE_COL_RE.test(f.header)) return { ...f, kind: 'image' as const, masterCol: '' };
    // Wired: the owner linked this column to another - it copies that
    // column's final value in code (applyWired), zero AI cost.
    if (f.sameAs) return { ...f, kind: 'wired' as const, masterCol: f.sameAs };
    // Fixed value (owner-pinned or auto from a single-value dropdown): filled
    // in code every run, never sent to the model - zero token cost.
    if (f.fixed) return { ...f, kind: 'fixed' as const, masterCol: '' };
    // Owner's explicit master pairing (template editor) wins over the
    // built-in DIRECT_MAP/same-name defaults. Silently ignored when the
    // master sheet no longer has that column - the defaults take over.
    if (f.masterAs) {
      const mh = masterHeaders.get(normHeader(f.masterAs));
      if (mh) return { ...f, kind: 'direct' as const, masterCol: mh };
    }
    const n = normHeader(f.header);
    if (/^(brand|brandname)$/.test(n)) return { ...f, kind: 'brand' as const, masterCol: '' };
    const d = DIRECT_MAP.find(([re]) => re.test(n));
    if (d) return { ...f, kind: 'direct' as const, masterCol: d[1] };
    // Same-named master column -> use OUR value (no dropdown = copied as-is;
    // with a dropdown it goes through the usual reconciliation). Creative
    // fields are excluded so listings stay fresh.
    const mh = masterHeaders.get(n);
    if (mh && !CONTENT_RE.test(f.header)) return { ...f, kind: 'direct' as const, masterCol: mh };
    // Price-like columns with no deterministic source export empty instead
    // of falling through to the AI.
    return { ...f, kind: SENSITIVE_RE.test(f.header) ? 'blank' as const : 'ai' as const, masterCol: '' };
  });
}

// Wired columns copy another column's FINAL value (one hop only - the editor
// prevents chains; a wired source resolves to empty here as a backstop). A
// copied value must still pass the target column's own dropdown list, so a
// wire can never smuggle a non-marketplace value into a locked column.
function applyWired(classified: Classified[], values: string[], note: (m: string) => void) {
  classified.forEach((f, ix) => {
    if (f.kind !== 'wired') return;
    const src = classified.findIndex(x => x.kind !== 'wired' && normHeader(x.header) === normHeader(f.masterCol));
    if (src < 0) { note(`${f.header}: linked column "${f.masterCol}" not found - left empty`); return; }
    const v = values[src];
    if (!v) return;
    // Placeholder values ({sku}-{size}...) defer validation to the per-row
    // substitution pass - mirror applyRules / applyCharts so a wired copy of
    // a token pattern is never dropped as "not in its list".
    if (f.allowed.length && !TOKEN_RE.test(v)) {
      const c = canon(f, v);
      if (!c) { note(`${f.header}: copied "${v}" is not in its own list - left empty`); return; }
      values[ix] = c;
    } else values[ix] = v;
  });
}

// ---- shared loaders (generate + scan_mappings + suggest_mappings) ---------

// Owner-defined template rules (listing_templates.rules): "WHEN a product's
// master/template column value matches -> SET columns". Deterministic, zero
// AI cost. A set entry carries a single value, a per-size chart, or both.
interface RuleSet { header: string; value: string; perSize: Record<string, string> }
interface TplRule { source: 'always' | 'master' | 'column'; key: string; op: 'is' | 'contains'; value: string; set: RuleSet[] }

// Evaluate rules for ONE product. Applies single-value sets to `values`
// in place (canon-validated) and returns the per-size charts keyed by
// column index for the expansion step. Runs BEFORE applyWired so wired
// copies propagate ruled values; overwrites the AI's pick (owner wins).
function applyRules(
  rules: TplRule[], classified: Classified[], values: string[],
  masterValOf: (col: string) => string, note: (m: string) => void,
): Map<number, Record<string, string>> {
  const charts = new Map<number, Record<string, string>>();
  for (const r of rules) {
    let hit = r.source === 'always';
    if (!hit) {
      let cv = '';
      if (r.source === 'master') cv = masterValOf(r.key.toUpperCase());
      else {
        const ix = classified.findIndex(f => normHeader(f.header) === normHeader(r.key));
        cv = ix < 0 ? '' : values[ix];
      }
      const a = cv.trim().toLowerCase();
      const b = r.value.trim().toLowerCase();
      hit = b !== '' && (r.op === 'contains' ? a.includes(b) : a === b);
    }
    if (!hit) continue;
    for (const s of r.set) {
      const ix = classified.findIndex(f => normHeader(f.header) === normHeader(s.header));
      if (ix < 0) { note(`rule: column "${s.header}" is not in this template - skipped`); continue; }
      const f = classified[ix];
      // An owner-skipped column stays empty even when a rule targets it - the
      // owner's "skip" wins. (Price-like blank columns are NOT skipped, so
      // rules can still fill them, per the v18 intent.)
      if (f.skip) { note(`rule: column "${f.header}" is skipped - left empty`); continue; }
      if (Object.keys(s.perSize).length) charts.set(ix, { ...(charts.get(ix) || {}), ...s.perSize });
      if (!s.value) continue;
      // Placeholder values ({sku}-{size}...) defer validation to the
      // per-row substitution pass - the final string is what must pass.
      if (f.allowed.length && !TOKEN_RE.test(s.value)) {
        const c = canon(f, s.value);
        if (c === undefined) { note(`rule for "${f.header}": "${s.value}" is not in the marketplace list - skipped`); continue; }
        values[ix] = c;
      } else values[ix] = s.value;
    }
  }
  return charts;
}

// Apply per-size chart values to one output row. Size keys are matched
// tolerantly ("xl" hits "XL"); chart values still pass the column's own
// dropdown (placeholder values defer validation to the substitution pass).
// No chart entry for this size -> the column keeps its value.
function applyCharts(
  charts: Map<number, Record<string, string>>, classified: Classified[],
  v: string[], size: string, note: (m: string) => void,
) {
  if (!size || charts.size === 0) return;
  for (const [ix, chart] of charts) {
    const key = Object.keys(chart).find(k => k.trim().toLowerCase() === size.trim().toLowerCase() || normHeader(k) === normHeader(size));
    if (!key) continue;
    const f = classified[ix];
    if (f.allowed.length && !TOKEN_RE.test(chart[key])) {
      const c = canon(f, chart[key]);
      if (c === undefined) { note(`size chart for "${f.header}": "${chart[key]}" is not in the marketplace list - skipped`); continue; }
      v[ix] = c;
    } else v[ix] = chart[key];
  }
}

// {sku} / {size} / {brand} placeholders - usable in fixed values, rule SET
// values and size-chart values - resolve per OUTPUT ROW: a child code
// pattern "{sku}-{size}" becomes XYZ-XS on the XS row while "{sku}" keeps
// the parent code. An empty part (e.g. no size on the row) tidies the
// leftover joiners so "XYZ-" exports as "XYZ".
// {today} / {date} (aliases) resolve to the current date - handy for an
// addedDate / launchDate column: set the fixed value to {today} and every
// run stamps the real date, instead of asking the AI (which has no clock
// and would hallucinate one).
const TOKEN_RE = /\{(sku|size|brand|today|date)\}/i;

function substituteTokens(v: string, parts: Record<string, string>): string {
  let emptyHit = false;
  const out = v.replace(/\{(sku|size|brand|today|date)\}/gi, (_, k) => {
    const key = k.toLowerCase() === 'date' ? 'today' : k.toLowerCase();
    const val = parts[key] || '';
    if (!val) emptyHit = true;
    return val;
  });
  return emptyHit ? out.replace(/[-_/ ]{2,}/g, '-').replace(/^[-_/ ]+|[-_/ ]+$/g, '') : out;
}

// Finalize ONE output row: per-size chart values, then wired copies (so a
// column wired to a chart-driven column gets THIS row's charted value, not a
// stale pre-expansion one), then placeholder substitution across EVERY column
// (fixed values, rule values, chart values AND wired copies of pattern
// columns). Substituted values in dropdown columns still pass canon.
function finalizeRow(
  charts: Map<number, Record<string, string>>, classified: Classified[],
  v: string[], parts: Record<string, string>, note: (m: string) => void,
) {
  applyCharts(charts, classified, v, parts.size || '', note);
  applyWired(classified, v, note);
  for (let ix = 0; ix < v.length; ix++) {
    if (!v[ix] || !TOKEN_RE.test(v[ix])) continue;
    const s = substituteTokens(v[ix], parts);
    const f = classified[ix];
    if (f.allowed.length) {
      const c = canon(f, s);
      if (c === undefined) { note(`${f.header}: "${s}" is not in the marketplace list - left empty`); v[ix] = ''; continue; }
      v[ix] = c;
    } else v[ix] = s;
  }
}

// Template row -> sanitized TplField[]. Oversized lists are never truncated
// into a wrong enum - a list beyond the cap is treated as free text (defense
// in depth; the client already drops them at parse time).
async function loadTemplateFields(templateId: string): Promise<{ tpl: any; fields: TplField[]; rules: TplRule[] } | { error: string }> {
  const tr = await fetch(`${SB_URL}/rest/v1/listing_templates?id=eq.${encodeURIComponent(templateId)}&select=name,marketplace,fields,rules,category`, { headers: svcHeaders });
  const trows = await tr.json().catch(() => []);
  const tpl = trows?.[0];
  if (!tpl) return { error: 'Template not found - save it again in Manage Templates' };
  const fields: TplField[] = (Array.isArray(tpl.fields) ? tpl.fields : [])
    .map((f: any) => {
      const allowed = [...new Set((Array.isArray(f?.allowed) ? f.allowed : []).map((v: unknown) => String(v ?? '').trim()).filter(Boolean))] as string[];
      return {
        header: String(f?.header || '').trim(),
        mandatory: f?.mandatory === true,
        hint: String(f?.hint || '').trim(),
        allowed: allowed.length > 500 ? [] : allowed,
        fixed: String(f?.fixed || '').trim(),
        skip: f?.skip === true,
        sameAs: String(f?.sameAs || '').trim(),
        masterAs: String(f?.masterAs || '').trim(),
      };
    })
    .filter((f: TplField) => f.header);
  if (fields.length === 0) return { error: 'This template has no fields - re-upload the sheet in Manage Templates' };
  // Rules are owner input persisted as jsonb - sanitize every field and drop
  // entries that can't act (no targets, or a condition missing key/value).
  const rules: TplRule[] = (Array.isArray(tpl.rules) ? tpl.rules : [])
    .map((r: any) => ({
      source: (['always', 'master', 'column'].includes(r?.source) ? r.source : 'always') as TplRule['source'],
      key: String(r?.key || '').trim(),
      op: (r?.op === 'contains' ? 'contains' : 'is') as TplRule['op'],
      value: String(r?.value || '').trim(),
      set: (Array.isArray(r?.set) ? r.set : []).map((s: any) => ({
        header: String(s?.header || '').trim(),
        value: String(s?.value || '').trim(),
        perSize: (s?.perSize && typeof s.perSize === 'object' && !Array.isArray(s.perSize))
          ? Object.fromEntries(Object.entries(s.perSize)
              .map(([k, v]) => [String(k).trim(), String(v ?? '').trim()])
              .filter(([k, v]) => k && v))
          : {},
      })).filter((s: RuleSet) => s.header && (s.value || Object.keys(s.perSize).length > 0)),
    }))
    .filter((r: TplRule) => r.set.length > 0 && (r.source === 'always' || (r.key && r.value)));
  return { tpl, fields, rules };
}

// Both master tabs in full: rows feed the SKU index (generate) and the
// distinct-value scan (scan_mappings); headers feed classification.
interface MasterTab { tab: string; headers: string[]; rows: string[][] }

// Short-lived module-scope cache of the whole master sheet. A 60-SKU run
// chunks into ~20 sequential edge calls that each used to re-download BOTH
// tabs (40 full reads) - latency + Google Sheets quota. Warm isolates share
// this cache so consecutive chunks read once. TTL keeps it fresh (a master
// edit shows within a minute); only a COMPLETE, error-free read is cached so
// a transient failure isn't served for the window.
const MASTER_TTL_MS = 60_000;
let masterCache: { id: string; at: number; tabs: MasterTab[]; masterHeaders: Map<string, string> } | null = null;

async function readMasterTabs(warnings: string[]): Promise<{ tabs: MasterTab[]; masterHeaders: Map<string, string> }> {
  const masterId = getMasterSheetId();
  if (masterCache && masterCache.id === masterId && Date.now() - masterCache.at < MASTER_TTL_MS) {
    return { tabs: masterCache.tabs, masterHeaders: masterCache.masterHeaders };
  }
  const tabs: MasterTab[] = [];
  const masterHeaders = new Map<string, string>();
  for (const tab of MASTER_TABS) {
    try {
      const rows = await readSheetRaw(masterId, tab);
      if (rows.length === 0) continue;
      const headers = rows[0].map(h => String(h ?? '').trim());
      for (const h of headers) { const k = normHeader(h); if (h && k && !masterHeaders.has(k)) masterHeaders.set(k, h.toUpperCase()); }
      tabs.push({ tab, headers, rows });
    } catch (e) { warnings.push(`Cannot read master tab "${tab}" - ${(e as Error).message}`); }
  }
  if (tabs.length === MASTER_TABS.length && warnings.length === 0) masterCache = { id: masterId, at: Date.now(), tabs, masterHeaders };
  return { tabs, masterHeaders };
}

const brandOfTab = (tab: string) => tab === 'ARYA' ? 'ARYA' : 'DRESSTIVE';

type SkuIndexRow = { tab: string; headers: string[]; row: string[] };
function buildSkuIndex(tabs: MasterTab[]): Record<string, SkuIndexRow> {
  const index: Record<string, SkuIndexRow> = {};
  for (const t of tabs) {
    const skuIdx = skuColIndex(t.headers);
    for (let i = 1; i < t.rows.length; i++) {
      const s2 = normSku(t.rows[i][skuIdx]);
      if (s2 && !index[s2]) index[s2] = { tab: t.tab, headers: t.headers, row: t.rows[i] };
    }
  }
  return index;
}
// Master-row text for the AI source AND category detection - same header
// filter, so PRICE/GST/IMAGE noise can't fake a garment keyword.
function rowTextOf(m: SkuIndexRow): string {
  return m.headers
    .map((h, i) => ({ h, v: String(m.row[i] ?? '').trim() }))
    .filter(x => x.h && x.v && !EXCLUDE_SRC.test(x.h))
    .map(x => `${x.h}: ${x.v}`)
    .join('\n');
}

// ---- Anthropic -------------------------------------------------------------

function buildSystemPrefix(tplName: string, marketplace: string, schemaFields: Classified[], taughtLines: string[], enumSet: Set<string>): string {
  const fieldLine = (f: Classified) => {
    let tag = '';
    if (f.allowed.length && enumSet.has(f.header)) tag = ` [FIXED LIST: ${f.allowed.length} allowed values]`;
    // Demoted from the strict format (list too large for the grammar): the
    // model sees a sample + a hard instruction; post-validation enforces it.
    else if (f.allowed.length) tag = ` [MUST be EXACTLY one of its ${f.allowed.length} valid values; e.g.: ${f.allowed.slice(0, 40).join('; ')}]`;
    return `- "${f.header}"${f.mandatory ? ' [MANDATORY]' : ''}${tag}${f.hint ? ` | hint: ${f.hint}` : ''}`;
  };
  return [
    'You write product listings for Arya Designs, an Indian ethnic-wear garment business selling under the brands ARYA and DRESSTIVE (kurta sets, sarees, lehenga cholis, gowns, dresses, co-ords).',
    'You fill marketplace listing sheets (Myntra, Ajio, Amazon, Shopify and similar) from master product data and one product photo per product.',
    '',
    'Rules:',
    '- Write fresh, unique copy on every run: vary vocabulary, sentence openings and structure between products and between runs. Never reuse boilerplate phrasing.',
    '- Use the product photo to judge visual attributes (pattern, print type, occasion, work detail, shade, silhouette) whenever the master data does not state them.',
    '- Never contradict the master data on physical facts (fabric, size, contents). If a value is truly unknown and not visible in the photo, output an empty string.',
    '- Titles: marketplace style, Title Case, product type plus the 2-3 strongest attributes. No promotional words like "best" or "premium quality".',
    '- Descriptions: 2 to 4 natural sentences, no ALL CAPS, no emoji, no HTML tags.',
    '- Fields marked [FIXED LIST] accept ONLY one of their allowed values (the output format enforces this) - pick the single best-fitting value, never invent a variation.',
    '- Each product may include a "Map to allowed values" section: those fields carry a source value from the master sheet - choose the allowed value CLOSEST in meaning to it (e.g. source "Sea Green" with allowed colors -> "Green").',
    '- Apply garment logic ACROSS fields: for semi-stitched or unstitched items, stitched-garment details (closures, final neckline, sleeve styling) do not exist yet - pick "NA" where the allowed list offers it, or leave optional fields empty. Stitch-type fields must agree with the master data (INCLUDES, description) and the photo.',
    '- Infer stitch type from the sizes: discrete ready-to-wear garment sizes (XS/S/M/L/XL/XXL and similar, or numeric bust/waist/chest sizes) mean the item is FULLY STITCHED - never describe it as semi-stitched or unstitched. Only an explicit master value of "Semi-Stitched" / "Unstitched", or a size like "Free Size" / "Unstitched (N m)", indicates the garment is not fully stitched.',
    '- Never invent construction details: do not state or imply any stitch type, closure (zip, drawstring, hook, tie) or fit-adjustment mechanic (e.g. "adjusts to your waist") in free-text copy unless the master data explicitly provides it. Describe only what the master data states or the photo clearly shows; when a construction detail is unknown, omit it - never default a lehenga, choli or kurta to "semi-stitched" and never invent a "drawstring".',
    '- Fabric fields: when the master fabric is a trade or fancy name that is not in the allowed list (e.g. "Jimmy Chu"), choose the closest REAL fabric from the list by composition and the photo\'s look and sheen (e.g. shiny synthetic -> Art Silk or Poly Silk). Never pick the first option as a default and never leave a mandatory fabric empty.',
    '- If a field hint lists allowed values, output EXACTLY one of the listed values, matching its spelling and case.',
    '- Fields marked MANDATORY must never be empty - make the best choice the data and photo support.',
    '- Output a value for every requested field key for every product.',
    ...(taughtLines.length ? ['', 'Owner-approved mappings - follow these EXACTLY and use them as precedent for similar values:', ...taughtLines] : []),
    '',
    `TEMPLATE: ${tplName}${marketplace ? ` (${marketplace})` : ''}`,
    'Fill ONLY these fields for each product:',
    ...schemaFields.map(fieldLine),
  ].join('\n');
}

// The API compiles every enum into a constrained-decoding grammar with a
// hard size limit. Budget which fields keep their enum: small lists win,
// oversized lists (and overflow past the total budget) are demoted to plain
// strings - they get prompt guidance + post-validation instead.
const ENUM_FIELD_CAP = 60;
const ENUM_TOTAL_CAP = 600;

function pickEnumFields(schemaFields: Classified[]): Set<string> {
  const candidates = schemaFields
    .filter(f => f.allowed.length > 0 && f.allowed.length <= ENUM_FIELD_CAP)
    .sort((a, b) => a.allowed.length - b.allowed.length);
  const keep = new Set<string>();
  let total = 0;
  for (const f of candidates) {
    if (total + f.allowed.length > ENUM_TOTAL_CAP) break;
    total += f.allowed.length;
    keep.add(f.header);
  }
  return keep;
}

function fieldSchema(f: Classified, keepEnum: boolean) {
  if (!f.allowed.length || !keepEnum) return { type: 'string' };
  // Optional fields may also stay empty; mandatory ones must pick a value.
  return { type: 'string', enum: f.mandatory ? f.allowed : [...f.allowed, ''] };
}

function buildSchema(schemaFields: Classified[], enumSet: Set<string>) {
  return {
    type: 'object',
    properties: {
      products: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            fields: {
              type: 'object',
              properties: Object.fromEntries(schemaFields.map(f => [f.header, fieldSchema(f, enumSet.has(f.header))])),
              required: schemaFields.map(f => f.header),
              additionalProperties: false,
            },
          },
          required: ['sku', 'fields'],
          additionalProperties: false,
        },
      },
    },
    required: ['products'],
    additionalProperties: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'Method not allowed', req);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  try {
    if (action === 'status') {
      const role = await callerRole(req);
      if (!role) return fail(401, 'Sign in to DailyOffice first', req);
      const key = await getSecret('anthropic_api_key');
      return json({ ok: true, hasKey: !!key, role, model: await getModel() }, req);
    }

    // Owner-facing model picker (Settings -> Listing AI). Whitelist only -
    // an arbitrary model string can never reach the Anthropic call.
    if (action === 'set_model') {
      const role = await callerRole(req);
      if (role !== 'admin') return fail(403, 'Only an admin can change the model', req);
      const model = String(body?.model || '').trim();
      if (!MODELS[model]) return fail(400, 'Unknown model - pick one of the listed options', req);
      await setSecret('listing_ai_model', model);
      return json({ ok: true, model }, req);
    }

    if (action === 'set_key') {
      const role = await callerRole(req);
      if (role !== 'admin') return fail(403, 'Only an admin can set the API key', req);
      const key = String(body?.key || '').trim();
      if (!key) { await setSecret('anthropic_api_key', ''); return json({ ok: true, cleared: true }, req); }
      if (!/^sk-ant-/.test(key)) return fail(400, 'That does not look like an Anthropic API key (it starts with sk-ant-)', req);
      // Free validation call - rejects a bad key before we store it.
      const t = await fetch(`https://api.anthropic.com/v1/models/${await getModel()}`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      if (t.status === 401 || t.status === 403) return fail(400, 'Anthropic rejected this key - check it and try again', req);
      await setSecret('anthropic_api_key', key);
      return json({ ok: true }, req);
    }

    // Live master-sheet header list - feeds the "fill from master column"
    // pairing select in the template editor. Dynamic: a new column in the
    // sheet appears here with zero code changes.
    if (action === 'master_columns') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can use Listing AI', req);
      const warnings: string[] = [];
      const { tabs, masterHeaders } = await readMasterTabs(warnings);
      if (tabs.length === 0) return fail(502, 'Could not read the master sheet', req, warnings.join('; '));
      return json({ ok: true, columns: [...masterHeaders.values()].sort() }, req);
    }

    // Free pre-generation check: is each SKU in the master sheet, and does
    // its master-row text look like this template's garment category? One
    // call for the whole run, zero AI tokens - catches a wrong-template
    // paste BEFORE any Anthropic spend. Warns only on positive evidence:
    // a row whose text names no garment never flags.
    if (action === 'validate') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can use Listing AI', req);
      const rawItems: { sku: string }[] = (Array.isArray(body?.items) ? body.items : [])
        .map((it: any) => ({ sku: normSku(it?.sku) }))
        .filter((it: any) => it.sku);
      const seen = new Set<string>();
      const lines = rawItems.filter(it => { if (seen.has(it.sku)) return false; seen.add(it.sku); return true; }).slice(0, VALIDATE_CAP);
      const templateId = String(body?.templateId || '').trim();
      if (lines.length === 0) return fail(400, 'No SKUs provided', req);
      if (!templateId) return fail(400, 'No template selected', req);
      const loaded = await loadTemplateFields(templateId);
      if ('error' in loaded) return fail(404, loaded.error, req);
      const tplCat: string | null = loaded.tpl.category || detectCategory(String(loaded.tpl.name || ''));
      const categorySource = loaded.tpl.category ? 'saved' : (tplCat ? 'name' : null);
      const warnings: string[] = [];
      const { tabs } = await readMasterTabs(warnings);
      if (tabs.length === 0) return fail(502, 'Could not read the master sheet', req, warnings.join('; '));
      const index = buildSkuIndex(tabs);
      const results = lines.map(ln => {
        const m = index[ln.sku];
        if (!m) return { sku: ln.sku, found: false, detected: null, detectedLabel: null, mismatch: false };
        const detected = detectCategory(rowTextOf(m));
        const mismatch = !!(tplCat && detected && !catCompatible(tplCat, detected));
        return { sku: ln.sku, found: true, detected, detectedLabel: catLabel(detected), mismatch };
      });
      return json({ ok: true, templateCategory: tplCat, templateCategoryLabel: catLabel(tplCat), categorySource, results, warnings }, req);
    }

    // RateCard Studio's From-Master mode: each SKU's master row + detected
    // garment category, plus the union of columns that carry data for these
    // SKUs (feeds the column picker). Free - cached master read, zero AI.
    // Category consistency is enforced client-side from the per-row ids.
    if (action === 'ratecard_rows') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can read the master sheet', req);
      const seenRc = new Set<string>();
      const skus = (Array.isArray(body?.skus) ? body.skus : [])
        .map((v: unknown) => normSku(v))
        .filter((v: string) => { if (!v || seenRc.has(v)) return false; seenRc.add(v); return true; })
        .slice(0, RATECARD_CAP);
      if (skus.length === 0) return fail(400, 'No SKUs provided', req);
      const warnings: string[] = [];
      const { tabs } = await readMasterTabs(warnings);
      if (tabs.length === 0) return fail(502, 'Could not read the master sheet', req, warnings.join('; '));
      const index = buildSkuIndex(tabs);
      const columns: string[] = []; // uppercased, first-seen order, only non-empty for these SKUs
      const rows = skus.map((sku: string) => {
        const m = index[sku];
        if (!m) return { sku, found: false, category: null, categoryLabel: null, values: {} };
        const values: Record<string, string> = {};
        m.headers.forEach((h, i) => {
          const label = String(h || '').trim().toUpperCase();
          const v = String(m.row[i] ?? '').trim();
          if (!label || !v) return;
          if (values[label] === undefined) values[label] = v; // first spelling wins on dup headers
          if (!columns.includes(label)) columns.push(label);
        });
        const category = detectCategory(rowTextOf(m));
        return { sku, found: true, category, categoryLabel: catLabel(category), values };
      });
      return json({ ok: true, columns, rows, warnings }, req);
    }

    // Free, deterministic: every distinct master value per template dropdown
    // column, bucketed exactly as a run would resolve it. Powers the Bulk
    // Teach page - unmatched values are listed for teaching; settled values
    // (auto / taught) are also returned, capped, so the board can SHOW them.
    if (action === 'scan_mappings') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can use Listing AI', req);
      const templateId = String(body?.templateId || '').trim();
      if (!templateId) return fail(400, 'No template selected', req);
      const loaded = await loadTemplateFields(templateId);
      if ('error' in loaded) return fail(404, loaded.error, req);
      const warnings: string[] = [];
      const { tabs, masterHeaders } = await readMasterTabs(warnings);
      if (tabs.length === 0) return fail(502, 'Could not read the master sheet', req, warnings.join('; '));

      const classified = classifyFields(loaded.fields, masterHeaders);
      // Only columns a run fills FROM a master column against a fixed list
      // can be taught: direct (paired master column) and brand (tab name).
      const scanCols = classified.filter(f => (f.kind === 'direct' || f.kind === 'brand') && f.allowed.length > 0);
      const mappings = await fetchAllMappings(warnings);
      const byKey: Record<string, MappingRow> = {};
      for (const m of mappings) byKey[`${m.field_key} ${m.source.trim().toLowerCase()}`] = m;

      const UNMATCHED_CAP = 200;
      const columns = scanCols.map(f => {
        const distinct = new Map<string, { value: string; count: number }>();
        if (f.kind === 'brand') {
          for (const t of tabs) {
            const b = brandOfTab(t.tab);
            const c = distinct.get(b.toLowerCase()) || { value: b, count: 0 };
            c.count += Math.max(0, t.rows.length - 1);
            distinct.set(b.toLowerCase(), c);
          }
        } else {
          for (const t of tabs) {
            // Normalized match - a tab may spell the header differently.
            const ci = t.headers.findIndex(h => normHeader(h) === normHeader(f.masterCol));
            if (ci < 0) continue;
            for (let i = 1; i < t.rows.length; i++) {
              const v = String(t.rows[i][ci] ?? '').trim();
              if (!v) continue;
              // SIZE columns: a comma line means "all these sizes" - count
              // the individual sizes (rows expand per size at generation),
              // so the joined string never shows up as needing a lesson.
              const toks = f.masterCol === 'SIZE' ? sizeTokens(v) : [];
              for (const p of (toks.length ? toks : [v])) {
                const c = distinct.get(p.toLowerCase()) || { value: p, count: 0 };
                c.count++;
                distinct.set(p.toLowerCase(), c);
              }
            }
          }
        }
        const key = normHeader(f.header);
        let ignoredN = 0;
        const autoValues: string[] = [];
        const taughtValues: { source: string; target: string }[] = [];
        const stale: { source: string; target: string }[] = [];
        const unmatched: { value: string; count: number }[] = [];
        for (const { value, count } of distinct.values()) {
          const c = canon(f, value);
          if (c) { autoValues.push(c); continue; }
          const m = byKey[`${key} ${value.toLowerCase()}`];
          if (m) {
            if (m.ignored) { ignoredN++; continue; }
            if (canon(f, m.target)) { taughtValues.push({ source: value, target: m.target }); continue; }
            // Taught, but the marketplace removed the target from the list -
            // the run falls back to AI for it. Surface it for re-teaching.
            stale.push({ source: value, target: m.target });
            continue;
          }
          unmatched.push({ value, count });
        }
        unmatched.sort((a, b) => b.count - a.count);
        autoValues.sort();
        taughtValues.sort((a, b) => a.source.localeCompare(b.source));
        return {
          header: f.header, fieldKey: key, masterCol: f.kind === 'brand' ? 'BRAND (sheet tab)' : f.masterCol,
          distinct: distinct.size, auto: autoValues.length, taught: taughtValues.length, ignored: ignoredN, stale,
          // Settled values are SHOWN (read-only) on the board, capped so a
          // giant column can't bloat the response.
          autoValues: autoValues.slice(0, 150),
          taughtValues: taughtValues.slice(0, 150),
          unmatched: unmatched.slice(0, UNMATCHED_CAP),
          truncated: unmatched.length > UNMATCHED_CAP ? unmatched.length - UNMATCHED_CAP : 0,
        };
      });
      return json({ ok: true, columns, warnings: warnings.length ? warnings : undefined }, req);
    }

    // Explicit-ask AI suggestions for unmatched master values. ONE batched
    // call; every proposal is canon-validated against the column's own list
    // before it leaves the server - an out-of-list value can never surface.
    // Nothing is saved here: the client stages suggestions for owner review.
    if (action === 'suggest_mappings') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can use Listing AI', req);
      const apiKey = await getSecret('anthropic_api_key');
      if (!apiKey) return json({ ok: false, error: 'no_api_key' }, req, 409);
      const templateId = String(body?.templateId || '').trim();
      if (!templateId) return fail(400, 'No template selected', req);
      const loaded = await loadTemplateFields(templateId);
      if ('error' in loaded) return fail(404, loaded.error, req);
      const byHeader = new Map(loaded.fields.map(f => [f.header, f]));

      const reqs = (Array.isArray(body?.columns) ? body.columns : [])
        .map((c: any) => ({
          header: String(c?.header || '').trim(),
          values: [...new Set((Array.isArray(c?.values) ? c.values : []).map((v: unknown) => String(v ?? '').trim()).filter(Boolean))] as string[],
        }))
        .filter((c: { header: string; values: string[] }) => c.header && c.values.length);
      if (reqs.length === 0) return fail(400, 'Nothing to suggest - no values sent', req);
      const total = reqs.reduce((s: number, c: { values: string[] }) => s + c.values.length, 0);
      if (total > 300) return fail(400, 'Too many values in one call (max 300) - suggest one column at a time', req);
      for (const c of reqs) {
        const f = byHeader.get(c.header);
        if (!f) return fail(400, `Column "${c.header}" is not in this template`, req);
        if (!f.allowed.length) return fail(400, `Column "${c.header}" has no fixed dropdown list - nothing to map to`, req);
      }

      // Existing lessons as precedent - the owner's own vocabulary guides
      // new suggestions ("Firozi" -> "Turquoise Blue" teaches "Firozi Blue").
      const precedent = (await fetchAllMappings())
        .filter(m => !m.ignored && m.target)
        .slice(0, 200)
        .map(m => `- ${m.field_label}: "${m.source}" -> "${m.target}"`);

      const sys = [
        'You map internal master-sheet values to marketplace listing values for Arya Designs, an Indian ethnic-wear garment business (kurta sets, sarees, lehenga cholis, gowns).',
        'The master sheet uses trade names, Hindi color words and shorthand; each marketplace column accepts ONLY its listed allowed values.',
        'For every master value, pick the ONE allowed value closest in real-world meaning (fabric composition, actual color, garment construction).',
        '- Hindi/trade colors: map by the actual shade (e.g. "Firozi" is turquoise, "Gajari" is a carrot pink-orange).',
        '- Fancy fabric trade names: map by real composition and typical look (e.g. shiny synthetic trade names -> Art Silk / Poly Silk).',
        '- If NO allowed value is a confident fit, output an empty string for target - never guess wildly.',
        ...(precedent.length ? ['', 'Owner-approved mappings as precedent - stay consistent with these:', ...precedent] : []),
      ].join('\n');
      const userText = reqs.map((c: { header: string; values: string[] }) => {
        const f = byHeader.get(c.header)!;
        return `COLUMN "${c.header}" - allowed values:\n${f.allowed.join('; ')}\n\nMaster values to map for this column:\n${c.values.map(v => `- ${v}`).join('\n')}`;
      }).join('\n\n');

      const schema = {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: { header: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' } },
              required: ['header', 'source', 'target'],
              additionalProperties: false,
            },
          },
        },
        required: ['suggestions'],
        additionalProperties: false,
      };
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          // Always the cheapest tier: suggestions are canon-validated below,
          // so a wrong guess can never become an invalid export.
          model: SUGGEST_MODEL,
          max_tokens: Math.min(8000, 300 + total * 30),
          system: sys,
          messages: [{ role: 'user', content: `${userText}\n\nOutput one suggestion object per master value (header, source, target). Empty target = no confident fit.` }],
          output_config: { format: { type: 'json_schema', schema } },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) return json({ ok: false, error: 'The Anthropic API key was rejected - update it in Settings -> Listing AI' }, req);
      if (r.status === 429) return json({ ok: false, error: 'Anthropic rate limit hit - wait a minute and try again' }, req);
      if (r.status >= 400) return json({ ok: false, error: String(data?.error?.message || `Anthropic API error (${r.status})`) }, req);
      const text = (data?.content || []).find((b: any) => b.type === 'text')?.text || '';
      let parsed: any = {};
      try {
        const start = text.indexOf('{'), end = text.lastIndexOf('}');
        parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
      } catch { return json({ ok: false, error: 'Could not read the AI response - try again' }, req); }
      let unsure = 0;
      const suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
        .map((s: any) => {
          const f = byHeader.get(String(s?.header || ''));
          if (!f) return null;
          const target = canon(f, String(s?.target || ''));
          if (!target) { unsure++; return null; }
          return { header: f.header, source: String(s?.source || ''), target };
        })
        .filter(Boolean);
      const u = data?.usage || {};
      const usage = {
        input_tokens: u.input_tokens || 0,
        output_tokens: u.output_tokens || 0,
        cache_read_input_tokens: u.cache_read_input_tokens || 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
      };
      return json({ ok: true, suggestions, unsure, usage, estUsd: estUsdOf(SUGGEST_MODEL, usage) }, req);
    }

    if (action === 'generate') {
      const role = await callerRole(req);
      if (!role || !['admin', 'manager'].includes(role)) return fail(403, 'Only admin or manager can use Listing AI', req);
      const apiKey = await getSecret('anthropic_api_key');
      if (!apiKey) return json({ ok: false, error: 'no_api_key' }, req, 409);

      // items: [{sku, link?}] - explicit per-SKU Dropbox folder link wins over
      // the name-based auto-search. Plain `skus` kept for compatibility.
      const rawItems: { sku: string; link: string }[] = (Array.isArray(body?.items) ? body.items : (Array.isArray(body?.skus) ? body.skus.map((s: unknown) => ({ sku: s })) : []))
        .map((it: any) => ({ sku: normSku(it?.sku), link: String(it?.link || '').trim() }))
        .filter((it: any) => it.sku);
      const seenSku = new Set<string>();
      const lines = rawItems.filter(it => { if (seenSku.has(it.sku)) return false; seenSku.add(it.sku); return true; }).slice(0, SKU_CAP);
      const templateId = String(body?.templateId || '').trim();
      if (lines.length === 0) return fail(400, 'No SKUs provided', req);
      if (!templateId) return fail(400, 'No template selected', req);

      const loaded = await loadTemplateFields(templateId);
      if ('error' in loaded) return fail(404, loaded.error, req);
      const { tpl, fields, rules: tplRules } = loaded;
      // Category guard inputs: force=true is the owner's explicit 'Run
      // anyway' from the preflight panel - it disables the mismatch skip.
      const force = body?.force === true;
      const tplCat: string | null = tpl.category || detectCategory(String(tpl.name || ''));

      // Master sheet first: its headers feed classification (a template
      // column with the same name as a master column copies OUR value).
      const warnings: string[] = [];
      const { tabs, masterHeaders } = await readMasterTabs(warnings);
      const index = buildSkuIndex(tabs);
      if (Object.keys(index).length === 0) return fail(502, 'Could not read the master sheet', req, warnings.join('; '));

      const classified = classifyFields(fields, masterHeaders);
      const imageCols = classified.filter(f => f.kind === 'image').slice(0, 12);
      const aiFields = classified.filter(f => f.kind === 'ai');
      // Direct/brand fields with a fixed dropdown can't be copied blindly -
      // the master value may not be in the marketplace's list. They join the
      // AI schema (enum-constrained) UNLESS taught mappings + exact matches
      // resolve them for every product in this batch (then they cost nothing).
      const mappedFields = classified.filter(f => (f.kind === 'direct' || f.kind === 'brand') && f.allowed.length > 0);

      // Taught mappings: the owner's permanent corrections, applied in code.
      // Paginated fetch (v11) - past 1000 lessons, everything still applies.
      // Ignored rows are the owner's "leave this to the AI" - excluded here.
      const allMappings = await fetchAllMappings(warnings);
      const activeMappings = allMappings.filter(m => !m.ignored && m.target);
      const taught: Record<string, string> = {};
      for (const m of activeMappings) taught[`${m.field_key} ${String(m.source).trim().toLowerCase()}`] = String(m.target);
      // Exact allowed-list match first, then a taught mapping (validated
      // against the list when one exists). undefined = needs the AI.
      const resolveVal = (f: Classified, raw: string): string | undefined => {
        if (!raw) return undefined;
        if (f.allowed.length) { const c = canon(f, raw); if (c) return c; }
        const t = taught[`${normHeader(f.header)} ${raw.trim().toLowerCase()}`];
        if (t === undefined) return undefined;
        return f.allowed.length ? canon(f, t) : t;
      };
      // Lessons go to the model as precedent. v11: this template's columns
      // first, newest lessons first (was: first 300 alphabetically - with
      // bulk teaching the relevant lessons could fall off the cap).
      const tplKeys = new Set(classified.filter(f => f.kind !== 'blank').map(f => normHeader(f.header)));
      const taughtLines = activeMappings
        .map((m, i) => ({ m, i })) // fetch order is already newest-first
        .sort((a, b) => {
          const ra = tplKeys.has(a.m.field_key) ? 0 : 1;
          const rb = tplKeys.has(b.m.field_key) ? 0 : 1;
          return ra !== rb ? ra - rb : a.i - b.i;
        })
        .slice(0, 300)
        .map(({ m }) => `- ${m.field_label}: "${m.source}" -> "${m.target}"`);

      // Dropbox photos are best-effort: generation still works text-only.
      // Owner-saved Image Folders (the parent folders holding every SKU's
      // subfolder) are searched first; Link Generator roots stay as fallback.
      let dbxToken: string | null = null;
      let folderPaths: string[] = [];
      let rootPaths: string[] = [];
      try {
        dbxToken = await getDropboxToken();
        try {
          const lf = await fetch(`${SB_URL}/rest/v1/listing_folders?select=link&limit=100`, { headers: svcHeaders });
          for (const r of (await lf.json().catch(() => [])) || []) {
            const url = String(r?.link || '');
            if (!url) continue;
            const hit = genRootCache[url];
            let p = hit && Date.now() - hit.at < ROOT_TTL_MS ? hit.p : '';
            if (!p) {
              const meta = await dbx(dbxToken, 'sharing/get_shared_link_metadata', { url });
              p = meta.data?.path_lower || '';
              if (meta.status >= 400 || !p) { delete genRootCache[url]; continue; }
              genRootCache[url] = { p, at: Date.now() };
            }
            folderPaths.push(p);
          }
        } catch { folderPaths = []; }
        rootPaths = await resolveImageRoots(dbxToken);
      } catch { /* no images */ }

      interface Item { sku: string; status: 'ok' | 'not_in_master' | 'bad_link' | 'category_mismatch'; tab?: string; headers?: string[]; row?: string[]; srcText?: string; img?: string | null; imgPaths?: string[]; imgLinks?: string[]; note?: string; linkSource?: string }
      const items: Item[] = [];
      for (const ln of lines) {
        const m = index[ln.sku];
        if (!m) { items.push({ sku: ln.sku, status: 'not_in_master' }); continue; }
        // Wrong-template guard: skip BEFORE any Dropbox/thumbnail/AI work.
        if (!force && tplCat) {
          const det = detectCategory(rowTextOf(m));
          if (det && !catCompatible(tplCat, det)) {
            items.push({ sku: ln.sku, status: 'category_mismatch', note: `Looks like ${catLabel(det)} in the master sheet, but this template is ${catLabel(tplCat)}` });
            continue;
          }
        }
        // Photo source priority: typed one-off link (loud failure) -> the
        // owner's Image Folders -> the master sheet's own IMAGE column link
        // -> Link Generator roots.
        let imgPaths: string[] = [];
        let linkSource = '';
        if (ln.link) {
          if (!dbxToken) { items.push({ sku: ln.sku, status: 'bad_link', note: 'Dropbox is not connected' }); continue; }
          const resolved = await resolveLinkImages(dbxToken, ln.link).catch(() => null);
          if (!resolved || resolved.length === 0) { items.push({ sku: ln.sku, status: 'bad_link', note: 'Could not open that Dropbox link' }); continue; }
          imgPaths = resolved; linkSource = 'typed';
        } else if (dbxToken) {
          if (folderPaths.length) {
            try { imgPaths = await findSkuImagePaths(dbxToken, folderPaths, ln.sku); if (imgPaths.length) linkSource = 'folders'; } catch { imgPaths = []; }
          }
          if (imgPaths.length === 0) {
            const imgIdx = (() => { let i = m.headers.findIndex(h => h.toUpperCase() === 'IMAGE'); if (i < 0) i = m.headers.findIndex(h => /image/i.test(h)); return i; })();
            const masterLink = imgIdx >= 0 ? String(m.row[imgIdx] ?? '').trim() : '';
            if (masterLink) {
              const r3 = await resolveLinkImages(dbxToken, masterLink).catch(() => null);
              if (r3?.length) { imgPaths = r3; linkSource = 'master'; }
            }
          }
          if (imgPaths.length === 0 && rootPaths.length) {
            try { imgPaths = await findSkuImagePaths(dbxToken, rootPaths, ln.sku); if (imgPaths.length) linkSource = 'search'; } catch { imgPaths = []; }
          }
        }
        const srcText = rowTextOf(m);
        let img: string | null = null;
        if (dbxToken && imgPaths.length) { try { img = await thumbB64(dbxToken, imgPaths[0]); } catch { img = null; } }
        items.push({ sku: ln.sku, status: 'ok', tab: m.tab, headers: m.headers, row: m.row, srcText, img, imgPaths, linkSource });
      }

      // Image columns: one share link per photo, first photo -> first image
      // column (Front Image), served as raw= so the URL returns the bytes.
      if (imageCols.length > 0 && dbxToken) {
        for (const it of items) {
          if (it.status !== 'ok') continue;
          const paths = it.imgPaths || [];
          const links: string[] = [];
          let note = '';
          for (let i = 0; i < Math.min(imageCols.length, paths.length); i++) {
            const mk = await ensureSharedLink(dbxToken, paths[i]);
            if (mk.rateLimited) { note = 'Dropbox rate limited - some image links missing'; break; }
            if (mk.needsReconnect) { note = mk.error || 'Reconnect Dropbox to create share links'; break; }
            links.push(mk.url ? rawUrl(mk.url) : '');
          }
          it.imgLinks = links;
          if (!note && paths.length < imageCols.length) note = `${paths.length} of ${imageCols.length} image slots filled`;
          if (note) it.note = note;
        }
      }

      const live = items.filter(i => i.status === 'ok');
      const masterVal = (it: Item, col: string) => {
        // Match by normalized header: the two master tabs may spell a header
        // differently ("Top Fabric" vs "Top-Fabric"), and masterCol carries
        // the FIRST tab's spelling - an exact compare silently read '' for
        // every product on the other tab.
        const i = (it.headers || []).findIndex(h => normHeader(h) === normHeader(col));
        return i < 0 ? '' : String((it.row || [])[i] ?? '').trim();
      };
      const brandOf = (it: Item) => brandOfTab(it.tab || '');
      // Mapped fields fully resolved for THIS batch (exact list match or a
      // taught mapping, for every product) leave the AI schema entirely -
      // they are filled in code below at zero token cost.
      const deterministic = new Set<string>();
      for (const f of mappedFields) {
        if (live.length === 0) break;
        const all = live.every(it => {
          const raw = f.kind === 'brand' ? brandOf(it) : masterVal(it, f.masterCol);
          // Multi-size values resolve when EVERY individual size does - the
          // row later expands into one row per size, so the joined line
          // itself never needs the AI.
          const toks = isSizeField(f) ? sizeTokens(raw) : [];
          if (toks.length) return toks.every(t => resolveVal(f, t) !== undefined);
          return resolveVal(f, raw) !== undefined;
        });
        if (all) deterministic.add(f.header);
      }
      // Price-like columns never join the AI schema - an unresolved value
      // exports empty rather than letting the model pick one.
      const liveMapped = mappedFields.filter(f => !deterministic.has(f.header) && !SENSITIVE_RE.test(f.header));
      const schemaFields = [...aiFields, ...liveMapped];
      const aiValues: Record<string, Record<string, string>> = {};
      let usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      const model = await getModel();
      // Cache checkup: the client threads the previous chunk's message id so
      // the API can pinpoint WHY a cache miss happened (docs: cache-diagnostics).
      const prevMessageId = typeof body?.prevMessageId === 'string' && body.prevMessageId ? body.prevMessageId : null;
      let messageId = '';
      let cacheNote = '';

      if (live.length > 0 && schemaFields.length > 0) {
        const nonce = crypto.randomUUID().slice(0, 8);
        const content: any[] = [];
        for (const it of live) {
          let text = `PRODUCT ${it.sku} (brand: ${brandOf(it)})\nMaster data:\n${it.srcText || '(no master data)'}`;
          if (liveMapped.length) {
            const mapLines = liveMapped.map(f => `${f.header}: ${(f.kind === 'brand' ? brandOf(it) : masterVal(it, f.masterCol)) || '(empty)'}`);
            text += `\nMap to allowed values:\n${mapLines.join('\n')}`;
          }
          content.push({ type: 'text', text });
          if (it.img) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: it.img } });
          else content.push({ type: 'text', text: '(no photo available for this product - use master data only)' });
        }
        content.push({ type: 'text', text: `Fill the template fields for each of the ${live.length} product(s) above. Run nonce ${nonce} - write wording unique to this run.` });
        const enumSet = pickEnumFields(schemaFields);
        const sysText = buildSystemPrefix(String(tpl.name || ''), String(tpl.marketplace || ''), schemaFields, taughtLines, enumSet);
        const doCall = (strict: boolean) => fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'cache-diagnosis-2026-04-07', 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            // Scale with schema WIDTH, not just SKU count - a 70-column
            // template needs far more than a flat per-SKU budget.
            max_tokens: Math.min(24000, 500 + live.length * Math.max(1600, 45 * schemaFields.length)),
            system: [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: strict ? content : [...content, { type: 'text', text: 'Reply with ONLY the JSON object {"products":[{"sku":...,"fields":{...}}]} - no prose, no code fences.' }] }],
            diagnostics: { previous_message_id: prevMessageId },
            ...(strict ? { output_config: { format: { type: 'json_schema', schema: buildSchema(schemaFields, enumSet) } } } : {}),
          }),
        });
        let r = await doCall(true);
        let data = await r.json().catch(() => ({}));
        if (r.status === 400 && /grammar|schema/i.test(String(data?.error?.message || ''))) {
          // Even the budgeted schema was too big for the grammar compiler:
          // retry once without the strict format - post-validation below
          // still guarantees only marketplace values survive.
          r = await doCall(false);
          data = await r.json().catch(() => ({}));
        }
        if (r.status === 401) return json({ ok: false, error: 'The Anthropic API key was rejected - update it in Settings -> Listing AI' }, req);
        if (r.status === 429) return json({ ok: false, error: 'Anthropic rate limit hit - wait a minute and try again' }, req);
        if (r.status >= 400) {
          const msg = String(data?.error?.message || '');
          return json({ ok: false, error: /grammar|schema/i.test(msg) ? 'This template has too many locked dropdowns for one run - set fixed values or skip unused columns in Manage Templates' : (msg || `Anthropic API error (${r.status})`) }, req);
        }
        if (data?.stop_reason === 'max_tokens') return json({ ok: false, error: 'The AI response was cut short - run fewer SKUs at a time' }, req);
        const text = (data?.content || []).find((b: any) => b.type === 'text')?.text || '';
        try {
          const start = text.indexOf('{'), end = text.lastIndexOf('}');
          const parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
          for (const p of (parsed?.products || [])) aiValues[normSku(p?.sku)] = p?.fields || {};
        } catch { return json({ ok: false, error: 'Could not read the AI response - try again' }, req); }
        // Post-validate every listed field against its marketplace list -
        // demoted (non-enum) fields are only guaranteed by this check.
        for (const it of live) {
          const av = aiValues[it.sku];
          if (!av) continue;
          for (const f of schemaFields) {
            if (!f.allowed.length) continue;
            const v = String(av[f.header] ?? '').trim();
            if (!v) continue;
            const c = canon(f, v);
            if (c) { av[f.header] = c; continue; }
            av[f.header] = '';
            const msg = `${f.header}: value not in the marketplace list - left empty`;
            it.note = it.note ? `${it.note}; ${msg}` : msg;
          }
        }
        const u = data?.usage || {};
        usage = {
          input_tokens: u.input_tokens || 0,
          output_tokens: u.output_tokens || 0,
          cache_read_input_tokens: u.cache_read_input_tokens || 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
        };
        messageId = String(data?.id || '');
        // Cache checkup verdict. messages_changed is EXPECTED here (each
        // chunk carries different SKUs while the cached SYSTEM prefix still
        // hits) - only structural breaks are worth telling the owner about.
        const reason = String(data?.diagnostics?.cache_miss_reason?.type || '');
        const CACHE_NOTES: Record<string, string> = {
          model_changed: 'the AI model changed mid-run',
          system_changed: 'the instructions changed between batches (e.g. a mapping was taught mid-run)',
          tools_changed: 'the output format changed between batches',
        };
        if (CACHE_NOTES[reason]) cacheNote = `Cache checkup: ${CACHE_NOTES[reason]} - this batch cost more than usual. It self-heals on the next run.`;
      }

      type OutRow = { sku: string; status: Item['status']; noImage?: boolean; linkSource?: string; note?: string; values: string[] };
      // {today}/{date} placeholder value: the current date in IST (this is an
      // India-time business) as YYYY-MM-DD, matching the sheet's date format.
      const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const rows = items.flatMap((it): OutRow[] => {
        if (it.status !== 'ok') return [{ sku: it.sku, status: it.status, note: it.note, values: classified.map(() => '') }];
        const av = aiValues[it.sku] || {};
        let imgSlot = 0;
        const values = classified.map(f => {
          if (f.kind === 'blank') return '';
          if (f.kind === 'image') return (it.imgLinks || [])[imgSlot++] || '';
          // Canonical spelling when the fixed value is from a dropdown list.
          if (f.kind === 'fixed') return f.allowed.length ? (canon(f, f.fixed) || f.fixed) : f.fixed;
          if (f.kind === 'brand') {
            const bv = brandOf(it);
            if (!f.allowed.length) return resolveVal(f, bv) ?? bv;
            // Exact list match or taught mapping first; else the model's
            // enum-constrained choice.
            return resolveVal(f, bv) ?? String(av[f.header] ?? '');
          }
          if (f.kind === 'direct') {
            const mv = masterVal(it, f.masterCol);
            if (!f.allowed.length) return resolveVal(f, mv) ?? mv;
            return resolveVal(f, mv) ?? String(av[f.header] ?? '');
          }
          return String(av[f.header] ?? '');
        });
        // Notes dedupe: chart failures inside the size loop would otherwise
        // repeat once per size row.
        const noteFn = (m: string) => { if (it.note?.includes(m)) return; it.note = it.note ? `${it.note}; ${m}` : m; };
        // Owner rules overwrite the AI's picks; per-size charts come back for
        // the expansion step. Wired copies are applied per output row inside
        // finalizeRow (so they pick up ruled + per-row charted values).
        const charts = applyRules(tplRules, classified, values, col => masterVal(it, col), noteFn);
        const base = { sku: it.sku, status: 'ok' as const, noImage: it.img ? undefined : true, linkSource: it.linkSource || undefined };
        // One row per size: a comma master SIZE + a dropdown size column
        // expands into otherwise-identical rows, one per resolved size
        // (Myntra LOT format - styleGroupId ties them together). EVERY column
        // paired to the master SIZE (there can be more than one, e.g. "Size" +
        // "Standard Size") gets this row's size, resolved to its own list;
        // columns that copied the joined line verbatim get it too. Unknown
        // sizes are skipped, never exported.
        const sizeIdxs = classified.map((f, i) => isSizeField(f) ? i : -1).filter(i => i >= 0);
        const sizeIdx = sizeIdxs[0] ?? -1;
        const rawSize = sizeIdx >= 0 ? masterVal(it, 'SIZE') : '';
        const toks = sizeIdx >= 0 ? sizeTokens(rawSize) : [];
        if (toks.length === 0) {
          // Single-row products (e.g. Onesize): chart keyed by the size
          // column's final value; placeholders resolve with that size too.
          finalizeRow(charts, classified, values, { sku: it.sku, size: sizeIdx >= 0 ? values[sizeIdx] : '', brand: brandOf(it), today: todayIST }, noteFn);
          return [{ ...base, note: it.note, values }];
        }
        const out: { sku: string; status: 'ok'; noImage?: boolean; linkSource?: string; note?: string; values: string[] }[] = [];
        const skippedSizes: string[] = [];
        for (const t of toks) {
          const c = resolveVal(classified[sizeIdx], t);
          if (c === undefined) { skippedSizes.push(t); continue; }
          const v = values.map((x, ix) => sizeIdxs.includes(ix)
            ? (resolveVal(classified[ix], t) ?? c) // each SIZE-paired column, per its own list
            : (x && x.trim().toLowerCase() === rawSize.trim().toLowerCase() ? c : x));
          finalizeRow(charts, classified, v, { sku: it.sku, size: c, brand: brandOf(it), today: todayIST }, noteFn);
          out.push({ ...base, note: [`size: ${c}`, it.note].filter(Boolean).join('; '), values: v });
        }
        if (skippedSizes.length) {
          const msg = `size(s) not in the marketplace list, row(s) skipped: ${skippedSizes.join(', ')} - teach them in Bulk Teach`;
          if (out.length) out[0].note = `${out[0].note}; ${msg}`;
          else {
            // Every size was unknown: still resolve placeholders/charts and
            // blank every size cell, so we never export literal {today}/{sku}
            // tokens or the joined "XS, S, M" line as a finished row.
            for (const j of sizeIdxs) values[j] = '';
            finalizeRow(charts, classified, values, { sku: it.sku, size: '', brand: brandOf(it), today: todayIST }, noteFn);
            out.push({ ...base, note: [it.note, msg].filter(Boolean).join('; '), values });
          }
        }
        return out;
      });

      return json({
        ok: true,
        headers: classified.map(f => f.header),
        kinds: classified.map(f => f.kind),
        rows,
        usage,
        model,
        estUsd: estUsdOf(model, usage),
        cacheSavedUsd: cacheSavedUsdOf(model, usage),
        messageId: messageId || undefined,
        cacheNote: cacheNote || undefined,
        aiFieldCount: aiFields.length,
        warnings: warnings.length ? warnings : undefined,
      }, req);
    }

    return fail(400, `Unknown action "${action}"`, req);
  } catch (e) {
    return fail(500, 'Internal error', req, (e as Error).message);
  }
});
