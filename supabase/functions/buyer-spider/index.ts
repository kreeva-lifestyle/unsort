// buyer-spider — find new buyers by walking lookalikes of one buyer's website.
//
// Seed = the website of a buyer the business already has (or wants). The
// function reads that site, has the model write a short BUYER PROFILE (what
// they sell, who to, where) plus search queries, runs the queries through a
// search API, reads every result site, and asks the model "is this the same
// kind of buyer?" — with the contacts read off the page. An accepted site is a
// lead AND, below max_depth, a new seed: its own queries find the next hop.
//
// The crawl is STEPPED: the client calls `step` in a loop and each call does
// one queue item (one page fetch + one model call + at most a handful of
// search calls), so a run survives the edge runtime's per-request limits and
// can be paused from the phone. A queue item is CLAIMED before it is worked
// (claimed_at, re-claimable after 3 minutes) so two devices stepping the same
// run never read and judge the same site twice, and every counter is added in
// SQL (buyer_run_bump) so no increment is lost. Everything is written here with
// the service role; the client only reads the tables (and updates outreach).
//
// Secrets: the Anthropic key and the owner-picked model come from app_secrets
// (Settings → Listing AI, same as pricing-ai). The Brave Search API key is
// stored by an admin through `set_search_key` — never in the browser. Brave's
// free plan allows MONTHLY_SEARCH_CAP searches a month: every search is first
// reserved in buyer_search_usage (one row per UTC month, one atomic RPC per
// search — refused once the month is spent), a run pauses at the cap and the
// UI warns from MONTHLY_SEARCH_WARN. (Google Programmable Search was dropped: Google no
// longer lets new engines search the whole web.)
//
// Honest limits: it only finds sites a search engine indexes and that publish
// contacts on their own pages. It reads at human-ish volume (one page per
// candidate, one contact page at most) and never logs into anything.
//
// Actions (POST JSON { action, ... }):
//   status          (signed-in)               -> { ok, hasSearchKey, hasAiKey, model, role, search_usage }
//   set_search_key  (admin)                   -> store/validate the Brave Search API key
//   start           (admin/manager/operator)  -> profile the seed, create a run
//   step            (admin/manager/operator)  -> process one queue item
//   pause           (admin/manager/operator)  -> status := paused
//   resume          (admin/manager/operator)  -> status := running

// deno-lint-ignore-file no-explicit-any

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };

const ALLOWED_ORIGINS = ['https://dailyoffice.aryadesigns.co.in', 'http://localhost:5173', 'http://localhost:4173'];
function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
}
const json = (body: unknown, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });
const fail = (status: number, error: string, req: Request, details?: string, extra: Record<string, unknown> = {}) => json({ ok: false, error, details, ...extra }, req, status);

// ── Caps (server-side, the client cannot raise them) ────────────────────────
const RUNS_PER_USER_PER_DAY = 5;
const MAX_QUERIES_PER_RUN = 120;      // search API calls
const MAX_PAGES_PER_RUN = 400;        // candidate sites read
const SEED_QUERIES = 8;               // queries written for the seed
const HOP_QUERIES = 3;                // queries written for an accepted lead
const RESULTS_PER_QUERY = 10;
const MIN_ACCEPT_SCORE = 55;          // the "worth contacting" band edge in JUDGE_SYSTEM
const PAGE_BYTES = 350_000;
const FETCH_MS = 10_000;
const CLAIM_STALE_MS = 3 * 60_000;    // a claimed item nobody finished (edge timeout) is retried after this
const MONTHLY_SEARCH_CAP = 1000;      // Brave free plan: never exceeded, per UTC month
const MONTHLY_SEARCH_WARN = 900;      // the UI warns from here

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

// ── Secrets / auth ──────────────────────────────────────────────────────────
async function getSecret(key: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${encodeURIComponent(key)}&select=value`, { headers: svcHeaders });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows?.[0]?.value ?? null;
}
async function setSecret(key: string, value: string): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets`, {
    method: 'POST', headers: { ...svcHeaders, prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`secret store ${r.status}`);
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
const CAN_RUN = ['admin', 'manager', 'operator'];

// ── PostgREST helpers ───────────────────────────────────────────────────────
async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init.prefer ? { prefer: init.prefer } : {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${r.status} ${path.split('?')[0]}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
// Counters are ADDED in SQL (buyer_run_bump): two devices stepping the same
// run can never overwrite each other's increments with a stale snapshot.
// p_month is unused by the function (see migration 20261015100000): it is sent
// so PostgREST resolves the 8-parameter overload unambiguously.
async function bump(runId: string, d: { pages?: number; queries?: number; leads?: number; note?: string; error?: string | null; status?: string | null }): Promise<any> {
  const row = await rest('rpc/buyer_run_bump', { method: 'POST', body: JSON.stringify({ p_run: runId, p_pages: d.pages ?? 0, p_queries: d.queries ?? 0, p_leads: d.leads ?? 0, p_note: d.note ?? null, p_error: d.error ?? null, p_status: d.status ?? null, p_month: null }) });
  return Array.isArray(row) ? row[0] : row;
}
// Brave's free plan: MONTHLY_SEARCH_CAP searches per month, never more. One
// row per UTC month in buyer_search_usage; reserveSearch() takes one search
// atomically BEFORE the request is made (the row lock serialises two devices
// or two users), and returns null once the month is spent. A search that
// fails after it was reserved still counts: Brave saw the request.
const monthKey = () => new Date().toISOString().slice(0, 7);
async function monthUsage(): Promise<number> {
  const r = await rest(`buyer_search_usage?month=eq.${monthKey()}&select=used`);
  return Number(r?.[0]?.used) || 0;
}
// A database failure here is a "search…" error: the run pauses with its
// resume note intact (like a Brave outage), never a failed site.
async function reserveSearch(): Promise<number | null> {
  let r: unknown;
  try { r = await rest('rpc/buyer_search_reserve', { method: 'POST', body: JSON.stringify({ p_month: monthKey(), p_cap: MONTHLY_SEARCH_CAP }) }); }
  catch (e) { throw new Error(`search_reserve_failed: ${String((e as Error)?.message || e).slice(0, 120)}`); }
  const n = Array.isArray(r) ? r[0] : r;
  return n === null || n === undefined ? null : Number(n);
}
const usageInfo = (used: number) => ({ used, cap: MONTHLY_SEARCH_CAP, warn_at: MONTHLY_SEARCH_WARN, month: monthKey() });

// ── URL safety ──────────────────────────────────────────────────────────────
// Every page fetch is a server-side request to a URL that came from the user
// or from a search engine. Three guards, in order: the hostname must look
// public (no IP literals, no localhost-style names, no wildcard-DNS services
// that resolve anything to 127.0.0.1), the name must RESOLVE to public
// addresses, and redirects are walked by hand so every hop passes the same
// two checks before it is requested.
const WILDCARD_DNS = /(^|\.)(nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|traefik\.me|vcap\.me)$/;
function publicHttpUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || !/^[a-z0-9.-]+$/.test(h) || /^[\d.]+$/.test(h)) return null;
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost') || WILDCARD_DNS.test(h)) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  return u;
}
const domainOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '');

const PRIVATE_IP = [/^127\./, /^10\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^::$/, /^f[cd]/i, /^fe[89ab]/i, /^::ffff:/i, /^64:ff9b:/i];
// True when every address the name resolves to is public. A runtime without
// DNS lookups falls back to the hostname rules above (not to "allow all" of
// anything that fails to resolve: an unresolvable name is simply unreachable).
async function resolvesPublic(host: string): Promise<boolean> {
  const dns = (Deno as any).resolveDns as undefined | ((h: string, t: string) => Promise<string[]>);
  if (typeof dns !== 'function') return true;
  const addrs: string[] = [];
  let unsupported = false;
  for (const t of ['A', 'AAAA']) {
    try { addrs.push(...await dns(host, t)); }
    catch (e) { if (/not supported|not implemented|permission|not allowed/i.test(String((e as Error)?.message || e))) unsupported = true; }
  }
  if (unsupported && addrs.length === 0) return true;
  return addrs.length > 0 && addrs.every(a => !PRIVATE_IP.some(re => re.test(a)));
}

// Sites that are never a buyer: social networks, marketplaces, directories,
// site builders' own domains, news. A search returns them constantly.
const BLOCK = /(^|\.)(instagram|facebook|fb|youtube|youtu|pinterest|twitter|x|tiktok|linkedin|reddit|quora|wikipedia|wikimedia|google|bing|yahoo|amazon|amzn|flipkart|myntra|ajio|meesho|etsy|ebay|alibaba|aliexpress|indiamart|justdial|tradeindia|exportersindia|yelp|tripadvisor|shopify|wix|squarespace|godaddy|wordpress|blogspot|medium|apple|microsoft|whatsapp|snapchat|threads|telegram|craigslist|gumtree|olx|quikr|sulekha|zomato|uber|nykaa|tatacliq|snapdeal|walmart|target|macys|nordstrom|asos|zara|hm|shein|temu|daraz|noon|namshi|lazada|mercari|vinted|depop|poshmark)\.(com|co|in|net|org|uk|ae|ca|au|sg|my|io|me|co\.uk|com\.au|co\.in|ae|pk|bd|lk)$/i;
const isBlocked = (domain: string) => BLOCK.test(domain) || domain.endsWith('.gov') || domain.endsWith('.edu');

// ── Page reading ────────────────────────────────────────────────────────────
interface Page { url: string; domain: string; title: string; description: string; text: string; links: { href: string; text: string }[]; contacts: Contacts }
interface Contacts { emails: string[]; phones: string[]; whatsapp: string[]; instagram: string[]; facebook: string[] }

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

// Bounded quantifiers everywhere: an unbounded email pattern is quadratic on
// the long unbroken tokens minified script leaves behind, and one such page
// could exceed the edge CPU limit.
function extractContacts(html: string, text: string): Contacts {
  const emails = uniq([...html.matchAll(/mailto:([^"'?\s>]{1,120})/gi)].map(m => decode(m[1]).toLowerCase())
    .concat([...text.matchAll(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g)].map(m => m[0].toLowerCase())))
    .filter(e => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(e) && !/example\.|sentry|wixpress|@2x/.test(e)).slice(0, 5);
  const phones = uniq([...html.matchAll(/tel:([^"'>]{1,40})/gi)].map(m => decode(m[1]).replace(/[^\d+]/g, ''))
    .concat([...text.matchAll(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)\d{3,4}[\s-]?\d{3,4}/g)].map(m => m[0].replace(/[^\d+]/g, ''))))
    .filter(p => p.replace(/\D/g, '').length >= 8 && p.replace(/\D/g, '').length <= 15).slice(0, 5);
  const whatsapp = uniq([...html.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)\/?(\+?\d{8,15})/gi)].map(m => m[1])).slice(0, 3);
  const instagram = uniq([...html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)].map(m => m[1].toLowerCase()))
    .filter(h => !['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'sharer', 'share', 'tv', 'direct'].includes(h)).slice(0, 3);
  const facebook = uniq([...html.matchAll(/facebook\.com\/([A-Za-z0-9._-]{2,60})/gi)].map(m => m[1]))
    .filter(h => !['sharer', 'share', 'sharer.php', 'plugins', 'dialog', 'login', 'tr', 'profile.php', 'pages', 'groups', 'hashtag', 'events', 'photo.php'].includes(h.toLowerCase())).slice(0, 3);
  return { emails, phones, whatsapp, instagram, facebook };
}

const UA = 'Mozilla/5.0 (compatible; DailyOffice buyer research; +https://dailyoffice.aryadesigns.co.in)';
async function readPage(u: URL): Promise<Page | null> {
  let r: Response | null = null; let cur = u;
  // Redirects are followed by hand: each hop is re-validated and re-resolved
  // BEFORE it is requested, so a 302 to a private address is never sent.
  for (let hop = 0; hop <= 5; hop++) {
    if (!(await resolvesPublic(cur.hostname))) return null;
    try { r = await fetch(cur.toString(), { redirect: 'manual', signal: AbortSignal.timeout(FETCH_MS), headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } }); }
    catch { return null; }
    if (![301, 302, 303, 307, 308].includes(r.status)) break;
    const loc = r.headers.get('location');
    try { await r.body?.cancel(); } catch { /* already closed */ }
    let next: URL | null = null;
    try { next = loc ? publicHttpUrl(new URL(loc, cur).toString()) : null; } catch { next = null; }
    if (!next) return null;
    cur = next; r = null;
  }
  if (!r || !r.ok) return null;
  const finalUrl = cur;
  const ct = r.headers.get('content-type') || '';
  if (ct && !/html|xml|text/i.test(ct)) return null;
  // Read at most PAGE_BYTES: a product page can be megabytes of script.
  const reader = r.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let got = 0;
  while (got < PAGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
  }
  try { await reader.cancel(); } catch { /* stream already closed */ }
  let html = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, got));
  // A cut that lands inside <script>/<style> would leave code in the text.
  html = html.replace(/<(script|style)\b[^>]*>(?:(?!<\/\1>)[^])*$/i, '');
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)?.[1] || '').slice(0, 400);
  const links: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= 300) break;
    links.push({ href: decode(m[1]), text: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  const text = decode(html.replace(/<(script|style|noscript|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article|header|footer)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return { url: finalUrl.toString(), domain: domainOf(finalUrl), title, description, text, links, contacts: extractContacts(html, text) };
}
function concat(chunks: Uint8Array[], n: number): Uint8Array {
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c.subarray(0, Math.min(c.length, n - o)), o); o += c.length; if (o >= n) break; }
  return out;
}

// A homepage often hides the contacts behind "Contact us". One extra page,
// same site only, when the homepage gave no email and no phone.
async function withContactPage(p: Page): Promise<Page> {
  if (p.contacts.emails.length || p.contacts.phones.length || p.contacts.whatsapp.length) return p;
  const link = p.links.find(l => /contact|reach|get in touch|about/i.test(l.text) || /contact/i.test(l.href));
  if (!link) return p;
  let target: URL | null = null;
  try { target = publicHttpUrl(new URL(link.href, p.url).toString()); } catch { target = null; }
  if (!target || domainOf(target) !== p.domain) return p;
  const c = await readPage(target);
  if (!c || c.domain !== p.domain) return p;
  const merge = (a: string[], b: string[]) => uniq([...a, ...b]).slice(0, 5);
  return { ...p, text: `${p.text}\n\n[CONTACT PAGE]\n${c.text.slice(0, 3000)}`, contacts: { emails: merge(p.contacts.emails, c.contacts.emails), phones: merge(p.contacts.phones, c.contacts.phones), whatsapp: merge(p.contacts.whatsapp, c.contacts.whatsapp), instagram: merge(p.contacts.instagram, c.contacts.instagram), facebook: merge(p.contacts.facebook, c.contacts.facebook) } };
}

// ── Brave Search ────────────────────────────────────────────────────────────
interface Hit { url: string; title: string; snippet: string }
interface SearchCfg { key: string }

async function loadSearchCfg(): Promise<SearchCfg | null> {
  const key = await getSecret('search_api_key');
  return key ? { key } : null;
}

// Every failure here throws a message starting with "search" — the step
// handler pauses the run on those rather than blaming the current site.
async function webSearch(cfg: SearchCfg, q: string): Promise<Hit[]> {
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: String(RESULTS_PER_QUERY * 2), search_lang: 'en', safesearch: 'off', text_decorations: 'false' })}`, {
    headers: { accept: 'application/json', 'x-subscription-token': cfg.key }, signal: AbortSignal.timeout(FETCH_MS),
  });
  if (r.status === 401 || r.status === 403) throw new Error('search_key_rejected');
  if (r.status === 429) throw new Error('search_rate_limited');
  if (!r.ok) throw new Error(`search ${r.status}`);
  const d = await r.json();
  return (d?.web?.results || []).map((x: any) => ({ url: String(x.url || ''), title: String(x.title || ''), snippet: String(x.description || '') }));
}
const searchErrorText = (e: unknown) => {
  const m = String((e as Error)?.message || e);
  if (m === 'search_key_rejected') return 'The Brave Search API key was rejected — an admin can replace it in Client Finder → Buyers';
  if (m === 'search_rate_limited') return 'The Brave Search rate limit was hit — wait a minute and resume';
  if (m === 'search_monthly_cap') return `Monthly search limit reached — all ${MONTHLY_SEARCH_CAP} free Brave searches for this month are used. Runs continue next month.`;
  if (m.startsWith('search_reserve_failed')) return 'The search counter could not be updated — wait a minute and resume';
  if (m.startsWith('search_store_failed')) return `Search results could not be saved (${m.slice(21, 120)}) — tap Resume to try again`;
  return `Search failed: ${m.slice(0, 120)} — wait a minute and resume`;
};

// ── The model ───────────────────────────────────────────────────────────────
// Errors that start with "Anthropic" pause the run; anything else is the
// current site's fault and the loop moves on.
async function askModel(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<{ data: any; usage: any; model: string }> {
  const apiKey = await getSecret('anthropic_api_key');
  if (!apiKey) throw new Error('Anthropic API key missing — an admin can add one in Settings → Listing AI');
  const model = await getModel();
  // Current models always think (turning it off is rejected): max_tokens
  // gets 4,000 of room for that on top of the JSON budget.
  const r = await fetch('https://api.anthropic.com/v1/messages', claudeRequest(apiKey, model, await getEffort(), {
    max_tokens: maxTokens + 4000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  }));
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('Anthropic rejected the API key — update it in Settings → Listing AI');
  if (r.status === 429) throw new Error('Anthropic rate limit hit — wait a minute and resume');
  if (r.status >= 500) throw new Error(`Anthropic is overloaded (${r.status}) — wait a minute and resume`);
  if (r.status >= 400) throw new Error(String(data?.error?.message || `Model request failed (${r.status})`));
  if (data?.stop_reason === 'refusal') throw new Error('The model declined this page');
  if (data?.stop_reason === 'max_tokens') throw new Error('Anthropic output was cut short — try again or pick a different model in Settings → Listing AI');
  const text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { throw new Error('The model returned nothing usable'); }
  return { data: parsed, usage: data?.usage || {}, model };
}

const BUSINESS = 'Arya Designs is an Indian ethnic-wear manufacturer in Surat (lehenga cholis, sarees, kurta sets, gowns, co-ords, under the brands ARYA and DRESSTIVE). It sells to retailers, boutiques, online sellers, wholesalers and distributors anywhere in the world.';
const BUYER_DEF = 'A BUYER is any business that buys finished garments to sell on: a boutique, a retail shop, an online store, a marketplace seller, or a wholesaler/distributor that resells to shops. NOT a buyer: a manufacturer or exporter like Arya, a marketplace or directory, a blog, a news site, software.';

const PROFILE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['business_name', 'what_they_sell', 'segment', 'customer', 'city', 'country', 'is_buyer', 'why', 'queries'],
  properties: {
    business_name: { type: 'string' }, what_they_sell: { type: 'string' }, segment: { type: 'string' }, customer: { type: 'string' },
    city: { type: 'string' }, country: { type: 'string' }, is_buyer: { type: 'boolean' }, why: { type: 'string' },
    queries: { type: 'array', items: { type: 'string' } },
  },
};
const PROFILE_SYSTEM = `${BUSINESS}
${BUYER_DEF}
You profile a buyer website from its homepage text, and write web search queries that would surface OTHER businesses of the same kind anywhere in the world — same products, same customer, similar size — never the same brand.
Rules: describe only what the page shows; is_buyer follows the definition above. Queries are plain search phrases a person would type (product + business type + place or diaspora market, e.g. "indian lehenga boutique Leicester", "desi bridal wear store New Jersey", "saree shop online UK"); vary the product, the business word and the geography; no quotes, no operators, no brand names.`;

const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['is_buyer', 'score', 'kind', 'name', 'what_they_sell', 'city', 'country', 'reason', 'email', 'phone', 'whatsapp', 'instagram', 'facebook', 'queries'],
  properties: {
    is_buyer: { type: 'boolean' }, score: { type: 'integer' },
    kind: { type: 'string', enum: ['boutique', 'retailer', 'online_store', 'wholesaler', 'marketplace_seller', 'other'] },
    name: { type: 'string' }, what_they_sell: { type: 'string' }, city: { type: 'string' }, country: { type: 'string' }, reason: { type: 'string' },
    email: { type: 'string' }, phone: { type: 'string' }, whatsapp: { type: 'string' }, instagram: { type: 'string' }, facebook: { type: 'string' },
    queries: { type: 'array', items: { type: 'string' } },
  },
};
const JUDGE_SYSTEM = `${BUSINESS}
${BUYER_DEF}
You judge whether a website is a buyer like the seed buyer described, and read its contact details.
Rules:
- is_buyer follows the definition above; the seed's own brand is not a new buyer.
- score: 0-100 how closely it matches the seed buyer. 80+ = same products and customer; ${MIN_ACCEPT_SCORE}-79 = related products, still worth contacting; under ${MIN_ACCEPT_SCORE} = not worth a salesperson's time (anything under ${MIN_ACCEPT_SCORE} is dropped).
- name/city/country from the page; empty string when not shown. Never guess a city.
- Contact fields: choose ONLY from the candidate contacts listed (copy them exactly) and leave a field empty when no candidate belongs to this business (e.g. a site builder's or a payment provider's address). Pick the main phone.
- queries: up to ${HOP_QUERIES} plain search phrases to find more shops like THIS one (its products + business word + its city/region or diaspora market); empty when not a buyer.
- reason: one plain sentence a salesperson can read.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const pageBlock = (p: Page) => `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nPAGE TEXT:\n${clip(p.text, 7000)}`;
const contactsBlock = (c: Contacts) => `CANDIDATE CONTACTS (found in the page code)\nemails: ${c.emails.join(', ') || '(none)'}\nphones: ${c.phones.join(', ') || '(none)'}\nwhatsapp: ${c.whatsapp.join(', ') || '(none)'}\ninstagram: ${c.instagram.join(', ') || '(none)'}\nfacebook: ${c.facebook.join(', ') || '(none)'}`;
const str = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
// A contact the model returns must be one we read off the page. An empty
// answer stays empty (the model saw only a site builder's address); a
// non-empty answer that does not match exactly falls back to the first read.
const chosen = (v: unknown, allowed: string[]): string | null => {
  const s = str(v, 120);
  if (!s) return null;
  return allowed.find(a => a.toLowerCase() === s.toLowerCase()) || allowed[0] || null;
};

// ── Queue helpers ───────────────────────────────────────────────────────────
async function enqueue(runId: string, hits: Hit[], hop: number, parent: string, query: string, seedDomain: string): Promise<number> {
  const rows: any[] = []; const seen = new Set<string>();
  for (const h of hits) {
    const u = publicHttpUrl(h.url); if (!u) continue;
    const d = domainOf(u);
    if (seen.has(d) || d === seedDomain || isBlocked(d)) continue;
    seen.add(d);
    // Every row carries the SAME keys (note included): PostgREST refuses a bulk
    // insert whose objects differ (400 PGRST102), which a known lead's note caused.
    rows.push({ run_id: runId, domain: d, url: `${u.protocol}//${u.host}/`, hop, parent_domain: parent, via_query: clip(query, 120), state: 'pending', note: null });
  }
  if (!rows.length) return 0;
  // Known leads from earlier runs are not re-read: they go straight to 'skipped'.
  // (domains passed publicHttpUrl, so they are [a-z0-9.-] and safe to quote.)
  const known: { domain: string }[] = await rest(`buyer_leads?select=domain&domain=in.(${rows.map(r => `"${r.domain}"`).join(',')})`);
  const knownSet = new Set(known.map(k => k.domain));
  for (const r of rows) if (knownSet.has(r.domain)) { r.state = 'skipped'; r.note = 'already a lead'; }
  // on_conflict=run_id,domain + ignore-duplicates: a domain surfaced by two
  // queries stays at the hop it was first seen.
  const ins = await fetch(`${SB_URL}/rest/v1/buyer_queue?on_conflict=run_id,domain`, { method: 'POST', headers: { ...svcHeaders, prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });
  if (!ins.ok) throw new Error(`db ${ins.status} buyer_queue: ${(await ins.text().catch(() => '')).slice(0, 160)}`);
  const inserted = await ins.json().catch(() => []);
  return (inserted as any[]).filter(r => r.state === 'pending').length;
}

// Runs the queries for one node (skipping the first `skip`, already run on a
// previous attempt). Every search is counted on the run the moment it ran, so
// a failure mid-way loses nothing; the caller gets how many ran before it.
// EVERY search is reserved against the month first (reserveSearch), so the
// 1,000th search is the last one this month whatever the run caps say — even
// with two runs stepping at once.
async function expand(run: any, cfg: SearchCfg, queries: string[], hop: number, parent: string, skip = 0): Promise<{ added: number; used: number; monthUsed: number; error: unknown }> {
  let added = 0, used = 0, queriesUsed = Number(run.queries_used) || 0;
  let monthUsed = await monthUsage();
  for (let i = skip; i < queries.length; i++) {
    if (queriesUsed >= MAX_QUERIES_PER_RUN) break;
    let taken: number | null;
    try { taken = await reserveSearch(); } catch (e) { return { added, used, monthUsed, error: e }; }
    if (taken === null) return { added, used, monthUsed: MONTHLY_SEARCH_CAP, error: new Error('search_monthly_cap') };
    monthUsed = taken;
    if (used > 0) await new Promise(res => setTimeout(res, 1100)); // Brave free plan: 1 request a second
    let hits: Hit[];
    try { hits = await webSearch(cfg, queries[i]); } catch (e) { return { added, used, monthUsed, error: e }; }
    used += 1;
    // A database failure here pauses the run like a search outage (the caller
    // keeps its resume note) instead of failing the seed and ending the run.
    try {
      queriesUsed = Number((await bump(run.id, { queries: 1 }))?.queries_used) || queriesUsed + 1;
      added += await enqueue(run.id, hits, hop, parent, queries[i], run.seed_domain);
    } catch (e) { return { added, used, monthUsed, error: new Error(`search_store_failed: ${String((e as Error)?.message || e).slice(0, 160)}`) }; }
  }
  return { added, used, monthUsed, error: null };
}

// Atomic claim: the PATCH's own filter re-checks "pending and unclaimed (or
// claimed too long ago)" under the row lock, so of two concurrent steppers
// exactly one gets the row back.
async function claimNext(runId: string): Promise<any | null> {
  const stale = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const free = `or=(claimed_at.is.null,claimed_at.lt.${encodeURIComponent(stale)})`;
  const cand = (await rest(`buyer_queue?run_id=eq.${runId}&state=eq.pending&${free}&order=hop.asc,created_at.asc&limit=1&select=*`))?.[0];
  if (!cand) return null;
  const got = await rest(`buyer_queue?id=eq.${cand.id}&state=eq.pending&${free}`, { method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ claimed_at: new Date().toISOString() }) });
  return got?.[0] ?? null;
}

// ── Actions ─────────────────────────────────────────────────────────────────
async function start(who: { id: string; role: string }, body: any, req: Request): Promise<Response> {
  const seed = publicHttpUrl(str(body.seed_url, 500));
  if (!seed) return fail(400, 'Enter the buyer\'s website, e.g. www.theirshop.com', req);
  const maxDepth = Math.min(3, Math.max(1, Number(body.max_depth) || 2));
  const maxLeads = Math.min(500, Math.max(10, Number(body.max_leads) || 150));
  const cfg = await loadSearchCfg();
  if (!cfg) return fail(400, 'No Brave Search API key yet — an admin adds one below', req);
  const monthUsed = await monthUsage();
  if (monthUsed >= MONTHLY_SEARCH_CAP) return fail(429, searchErrorText(new Error('search_monthly_cap')), req, undefined, { search_usage: usageInfo(monthUsed) });
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await rest(`buyer_runs?select=id&created_by=eq.${who.id}&created_at=gte.${since}`);
  if (recent.length >= RUNS_PER_USER_PER_DAY) return fail(429, `Daily limit reached — ${RUNS_PER_USER_PER_DAY} runs per person per day`, req);
  const page = await readPage(seed);
  if (!page) return fail(400, 'That website could not be read — check the address, or try its home page', req);
  const seedDomain = page.domain;
  let prof: any, usage: any;
  try { ({ data: prof, usage } = await askModel(PROFILE_SYSTEM, `${pageBlock(page)}\n\nWrite the buyer profile and ${SEED_QUERIES} search queries as JSON.`, PROFILE_SCHEMA, 1500)); }
  catch (e) { return fail(502, String((e as Error)?.message || e).slice(0, 300), req); }
  const profile = { business_name: str(prof.business_name), what_they_sell: str(prof.what_they_sell, 300), segment: str(prof.segment), customer: str(prof.customer, 200), city: str(prof.city, 80), country: str(prof.country, 80), is_buyer: !!prof.is_buyer, why: str(prof.why, 300), queries: (Array.isArray(prof.queries) ? prof.queries : []).map((q: unknown) => str(q, 120)).filter(Boolean).slice(0, SEED_QUERIES), usage };
  if (!profile.queries.length) return fail(502, 'The model could not write search queries for this site — try a different buyer', req, profile.why);
  const [run] = await rest('buyer_runs', { method: 'POST', prefer: 'return=representation', body: JSON.stringify({ created_by: who.id, seed_url: page.url, seed_domain: seedDomain, profile, max_depth: maxDepth, max_leads: maxLeads, pages_fetched: 1, step_note: profile.is_buyer ? 'Profiled the seed — searching next' : 'Note: the seed does not read as a buyer itself; searching anyway' }) });
  // The seed's queries run on the first step, so Start returns fast.
  await rest('buyer_queue', { method: 'POST', body: JSON.stringify({ run_id: run.id, domain: seedDomain, url: page.url, hop: 0, state: 'pending', note: 'seed' }) });
  return json({ ok: true, run, search_usage: usageInfo(monthUsed) }, req);
}

async function step(who: { id: string }, body: any, req: Request): Promise<Response> {
  const runId = str(body.run_id, 40);
  if (!/^[0-9a-f-]{36}$/.test(runId)) return fail(400, 'Missing run', req);
  const run0 = (await rest(`buyer_runs?id=eq.${runId}&select=*`))?.[0];
  if (!run0) return fail(404, 'Run not found', req);
  let monthUsed = await monthUsage();
  const usage = () => usageInfo(monthUsed);
  if (run0.status !== 'running') return json({ ok: true, run: run0, done: run0.status !== 'paused', search_usage: usage() }, req);
  const finish = async (status: string, note: string) => json({ ok: true, run: await bump(runId, { status, note }), done: true, search_usage: usage() }, req);
  if (run0.leads_found >= run0.max_leads) return finish('done', `Reached ${run0.max_leads} leads`);
  if (run0.pages_fetched >= MAX_PAGES_PER_RUN) return finish('done', `Read ${MAX_PAGES_PER_RUN} sites — the cap for one run`);
  const item = await claimNext(runId);
  if (!item) {
    const busy = (await rest(`buyer_queue?run_id=eq.${runId}&state=eq.pending&select=id&limit=1`))?.length > 0;
    // Another device holds the last items: nothing to do this tick, not done.
    if (busy) return json({ ok: true, run: run0, done: false, search_usage: usage() }, req);
    return finish('done', run0.queries_used >= MAX_QUERIES_PER_RUN ? `Used the ${MAX_QUERIES_PER_RUN}-search cap for one run` : 'Nothing left to check');
  }
  const cfg = await loadSearchCfg();
  if (!cfg) return fail(400, 'The Brave Search API key is gone — an admin can add it again', req);
  const setItem = (state: string, note: string) => rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ state, note: clip(note, 200) }) });
  const reply = (run: any, it: Record<string, unknown>, modelUsage?: unknown) => json({ ok: true, run, done: false, item: { domain: item.domain, hop: item.hop, ...it }, usage: modelUsage, search_usage: usage() }, req);
  // Pauses the run with the reason; the client shows Resume. Searches already
  // run were counted as they ran; `usedNow` is only for the note.
  const pause = async (e: unknown, usedNow = 0) => {
    const m = String((e as Error)?.message || e);
    const friendly = /^search/.test(m) ? searchErrorText(e) : m.slice(0, 300);
    const run = await bump(runId, { status: 'paused', error: friendly, note: `${friendly}${usedNow ? ` (${usedNow} searches done)` : ''}` });
    return json({ ok: false, error: friendly, run, search_usage: usage() }, req, 502);
  };
  // The month is already spent: pause before claiming anything.
  if (monthUsed >= MONTHLY_SEARCH_CAP) { await rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ claimed_at: null }) }); return pause(new Error('search_monthly_cap')); }
  let itemState: string | null = null;

  try {
    // Hop 0 is the seed itself: run its queries, nothing to judge. A retry
    // after a search failure skips the queries that already ran.
    if (item.hop === 0) {
      const skip = Number((String(item.note || '').match(/searched:(\d+)/) || [])[1]) || 0;
      const { added, used, error, monthUsed: mu } = await expand(run0, cfg, run0.profile?.queries || [], 1, run0.seed_domain, skip);
      monthUsed = mu;
      if (error) { await rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ claimed_at: null, note: `seed searched:${skip + used}` }) }); return pause(error, skip + used); }
      await setItem('accepted', 'seed');
      return reply(await bump(runId, { note: `Searched ${skip + used} queries — ${added} sites to check` }), { result: 'searched', added });
    }
    // A lead whose hop searches were interrupted (search outage) comes back
    // as pending with its remaining queries in the note: no re-read, no
    // second model call, just the searches that never ran.
    const resumeLead = (() => { try { const n = JSON.parse(String(item.note || '')); return n && n.lead ? n : null; } catch { return null; } })();
    if (resumeLead) {
      const r = await expand(run0, cfg, resumeLead.queries || [], item.hop + 1, item.domain, resumeLead.searched || 0);
      monthUsed = r.monthUsed;
      if (r.error) { await rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ claimed_at: null, note: JSON.stringify({ ...resumeLead, searched: (resumeLead.searched || 0) + r.used }) }) }); return pause(r.error, r.used); }
      await setItem('accepted', `${resumeLead.score} — ${resumeLead.reason}`);
      return reply(await bump(runId, { note: `${item.domain}: searches finished — ${r.added} more to check` }), { result: 'lead', score: resumeLead.score, added: r.added });
    }
    const target = publicHttpUrl(item.url);
    const page0 = target ? await readPage(target) : null;
    if (!page0) {
      await setItem('skipped', 'unreachable');
      return reply(await bump(runId, { pages: 1, note: `${item.domain}: could not be read` }), { result: 'unreachable' });
    }
    // A site that now forwards to the seed or to a blocklisted domain is not
    // a new buyer, whatever its old name was.
    if (page0.domain !== item.domain && (page0.domain === run0.seed_domain || isBlocked(page0.domain))) {
      await setItem('skipped', `redirects to ${page0.domain}`);
      return reply(await bump(runId, { pages: 1, note: `${item.domain}: forwards to ${page0.domain}` }), { result: 'unreachable' });
    }
    const page = await withContactPage(page0);
    const seedP = run0.profile || {};
    const user = `SEED BUYER (what we are looking for more of)\nname: ${seedP.business_name}\nsells: ${seedP.what_they_sell}\nsegment: ${seedP.segment}\ncustomer: ${seedP.customer}\nplace: ${[seedP.city, seedP.country].filter(Boolean).join(', ')}\n\nCANDIDATE SITE\n${pageBlock(page)}\n\n${contactsBlock(page.contacts)}\n\nJudge the candidate as JSON.`;
    const { data: v, usage: modelUsage } = await askModel(JUDGE_SYSTEM, user, JUDGE_SCHEMA, 900);
    const score = Math.max(0, Math.min(100, Math.round(Number(v.score) || 0)));
    const accepted = !!v.is_buyer && score >= MIN_ACCEPT_SCORE;
    if (!accepted) {
      await setItem('rejected', `${score} — ${str(v.reason, 160)}`);
      return reply(await bump(runId, { pages: 1, note: `${page.domain}: not a buyer (${score})` }), { result: 'rejected', score }, modelUsage);
    }
    const lead = {
      domain: page.domain, url: page.url, name: str(v.name, 120) || page.title.slice(0, 120), kind: str(v.kind, 30) || 'other', what_they_sell: str(v.what_they_sell, 300),
      city: str(v.city, 80), country: str(v.country, 80), score, reason: str(v.reason, 400), hop: item.hop, parent_domain: item.parent_domain,
      email: chosen(v.email, page.contacts.emails), phone: chosen(v.phone, page.contacts.phones), whatsapp: chosen(v.whatsapp, page.contacts.whatsapp),
      instagram: chosen(v.instagram, page.contacts.instagram), facebook: chosen(v.facebook, page.contacts.facebook),
      first_run_id: runId, found_by: who.id, updated_at: new Date().toISOString(),
    };
    // ignore-duplicates: a domain that became a lead in a parallel step keeps its first record.
    const ins = await fetch(`${SB_URL}/rest/v1/buyer_leads?on_conflict=domain`, { method: 'POST', headers: { ...svcHeaders, prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(lead) });
    if (!ins.ok) throw new Error(`db ${ins.status} buyer_leads: ${(await ins.text()).slice(0, 200)}`);
    const wrote = ((await ins.json().catch(() => [])) as any[]).length > 0;
    await setItem('accepted', `${score} — ${lead.reason}`);
    itemState = 'accepted';
    // The lead and the page are on the books BEFORE the hop searches run.
    let run = await bump(runId, { pages: 1, leads: wrote ? 1 : 0 });
    let added = 0;
    if (item.hop < run0.max_depth) {
      const qs = (Array.isArray(v.queries) ? v.queries : []).map((q: unknown) => str(q, 120)).filter(Boolean).slice(0, HOP_QUERIES);
      const r = await expand(run, cfg, qs, item.hop + 1, page.domain);
      added = r.added; monthUsed = r.monthUsed;
      if (r.error) {
        // Back to pending with the leftover queries, so Resume finishes them.
        await rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ state: 'pending', claimed_at: null, note: JSON.stringify({ lead: true, score, reason: lead.reason.slice(0, 120), searched: r.used, queries: qs }) }) });
        return pause(r.error, r.used);
      }
    }
    run = await bump(runId, { note: `${lead.name || page.domain}: buyer (${score})${added ? ` — ${added} more to check` : ''}` });
    return reply(run, { result: 'lead', score, added }, modelUsage);
  } catch (e) {
    const m = String((e as Error)?.message || e);
    try { monthUsed = await monthUsage(); } catch { /* the reply keeps the last known count */ }
    // A key, quota or provider outage pauses the run (searches throw "search…",
    // model problems "Anthropic…"); a single bad site is marked failed and the
    // loop moves on — unless it was already accepted, which stands.
    if (/^search|^Anthropic/.test(m)) { if (!itemState) await rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ claimed_at: null }) }); return pause(e); }
    if (itemState !== 'accepted') await setItem('failed', m.slice(0, 200));
    return reply(await bump(runId, { pages: itemState ? 0 : 1, error: m.slice(0, 300), note: `${item.domain}: ${m.slice(0, 160)}` }), { result: 'failed' });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(405, 'POST only', req);
  const body = await req.json().catch(() => null);
  const action = str(body?.action, 40);
  const who = await caller(req);
  if (!who) return fail(401, 'Sign in to DailyOffice first', req);
  try {
    if (action === 'status') {
      const cfg = await loadSearchCfg();
      return json({ ok: true, hasSearchKey: !!cfg, hasAiKey: !!(await getSecret('anthropic_api_key')), model: await getModel(), role: who.role, search_usage: usageInfo(await monthUsage()), caps: { runsPerDay: RUNS_PER_USER_PER_DAY, queriesPerRun: MAX_QUERIES_PER_RUN, pagesPerRun: MAX_PAGES_PER_RUN } }, req);
    }
    if (action === 'set_search_key') {
      if (who.role !== 'admin') return fail(403, 'Only an admin can set the search API key', req);
      const key = str(body.key, 200);
      if (!key) return fail(400, 'Paste the API key first', req);
      // One real query before storing: a bad key is refused here, not mid-run.
      // It is reserved against the month like any other search.
      const taken = await reserveSearch();
      if (taken === null) return fail(429, searchErrorText(new Error('search_monthly_cap')), req, undefined, { search_usage: usageInfo(MONTHLY_SEARCH_CAP) });
      try { await webSearch({ key }, 'indian clothing boutique'); } catch (e) { return fail(400, searchErrorText(e), req, undefined, { search_usage: usageInfo(taken) }); }
      await setSecret('search_api_key', key);
      return json({ ok: true, hasSearchKey: true, search_usage: usageInfo(taken) }, req);
    }
    if (!CAN_RUN.includes(who.role)) return fail(403, 'Sign in as admin, manager or operator to find buyers', req);
    if (action === 'start') return await start(who, body, req);
    if (action === 'step') return await step(who, body, req);
    if (action === 'pause' || action === 'resume') {
      const runId = str(body?.run_id, 40);
      if (!/^[0-9a-f-]{36}$/.test(runId)) return fail(400, 'Missing run', req);
      const run = (await rest(`buyer_runs?id=eq.${runId}&select=id,status`))?.[0];
      if (!run) return fail(404, 'Run not found', req);
      if (run.status === 'done' || run.status === 'failed') return fail(400, 'That run has finished', req);
      const updated = await bump(runId, { status: action === 'pause' ? 'paused' : 'running', note: action === 'pause' ? 'Paused' : 'Resumed', error: null });
      return json({ ok: true, run: updated, search_usage: usageInfo(await monthUsage()) }, req);
    }
    return fail(400, 'Unknown action', req);
  } catch (e) {
    return fail(500, String((e as Error)?.message || e).slice(0, 300), req);
  }
});

// Pure helpers, exported for the repo's node harness only (unused at runtime).
export const __test = { publicHttpUrl, extractContacts, isBlocked, domainOf };
