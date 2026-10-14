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
// can be paused from the phone. Everything is written here with the service
// role; the client only reads the tables (and updates outreach columns).
//
// Secrets: the Anthropic key and the owner-picked model come from app_secrets
// (Settings → Listing AI, same as pricing-ai). The search API key is stored by
// an admin through `set_search_key` — Brave Search or Google Programmable
// Search — never in the browser.
//
// Honest limits: it only finds sites a search engine indexes and that publish
// contacts on their own pages. It reads at human-ish volume (one page per
// candidate, one contact page at most) and never logs into anything.
//
// Actions (POST JSON { action, ... }):
//   status          (signed-in)               -> { ok, searchProvider, hasAiKey, model, role }
//   set_search_key  (admin)                   -> store/validate the search API key
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
const fail = (status: number, error: string, req: Request, details?: string) => json({ ok: false, error, details }, req, status);

// ── Caps (server-side, the client cannot raise them) ────────────────────────
const RUNS_PER_USER_PER_DAY = 5;
const MAX_QUERIES_PER_RUN = 120;      // search API calls
const MAX_PAGES_PER_RUN = 400;        // candidate sites read
const SEED_QUERIES = 8;               // queries written for the seed
const HOP_QUERIES = 3;                // queries written for an accepted lead
const RESULTS_PER_QUERY = 10;
const MIN_ACCEPT_SCORE = 55;
const PAGE_BYTES = 350_000;
const FETCH_MS = 10_000;

// Same whitelist + prices as listing-ai / pricing-ai (USD per MTok).
const MODELS: Record<string, { in: number; out: number }> = { 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-sonnet-5': { in: 3, out: 15 }, 'claude-opus-4-8': { in: 5, out: 25 } };
const DEFAULT_MODEL = 'claude-haiku-4-5';

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
const CAN_RUN = ['admin', 'manager', 'operator'];

// ── PostgREST helpers ───────────────────────────────────────────────────────
async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...svcHeaders, ...(init.prefer ? { prefer: init.prefer } : {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${r.status} ${path.split('?')[0]}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const patchRun = (id: string, body: Record<string, unknown>) =>
  rest(`buyer_runs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

// ── URL safety ──────────────────────────────────────────────────────────────
// Every page fetch is a server-side request to a URL that came from the user
// or from a search engine. Only public http(s) hostnames, never IP literals,
// localhost or link-local names, so this can never be pointed at the
// metadata service or anything inside the project.
function publicHttpUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  return u;
}
const domainOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, '');

// Sites that are never a buyer: social networks, marketplaces, directories,
// site builders' own domains, news. A search returns them constantly.
const BLOCK = /(^|\.)(instagram|facebook|fb|youtube|youtu|pinterest|twitter|x|tiktok|linkedin|reddit|quora|wikipedia|wikimedia|google|bing|yahoo|amazon|amzn|flipkart|myntra|ajio|meesho|etsy|ebay|alibaba|aliexpress|indiamart|justdial|tradeindia|exportersindia|yelp|tripadvisor|shopify|wix|squarespace|godaddy|wordpress|blogspot|medium|apple|microsoft|whatsapp|snapchat|threads|telegram|craigslist|gumtree|olx|quikr|sulekha|zomato|uber|nykaa|tatacliq|snapdeal|walmart|target|macys|nordstrom|asos|zara|hm|shein|temu|daraz|noon|namshi|lazada|mercari|vinted|depop|poshmark)\.(com|co|in|net|org|uk|ae|ca|au|sg|my|io|me|co\.uk|com\.au|co\.in|ae|pk|bd|lk)$/i;
const isBlocked = (domain: string) => BLOCK.test(domain) || domain.endsWith('.gov') || domain.endsWith('.edu');

// ── Page reading ────────────────────────────────────────────────────────────
interface Page { url: string; domain: string; title: string; description: string; text: string; links: { href: string; text: string }[]; contacts: Contacts }
interface Contacts { emails: string[]; phones: string[]; whatsapp: string[]; instagram: string[]; facebook: string[] }

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

function extractContacts(html: string, text: string): Contacts {
  const emails = uniq([...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map(m => decode(m[1]).toLowerCase())
    .concat([...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map(m => m[0].toLowerCase())))
    .filter(e => !/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(e) && !/example\.|sentry|wixpress|@2x/.test(e)).slice(0, 5);
  const phones = uniq([...html.matchAll(/tel:([^"'>]+)/gi)].map(m => decode(m[1]).replace(/[^\d+]/g, ''))
    .concat([...text.matchAll(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)\d{3,4}[\s-]?\d{3,4}/g)].map(m => m[0].replace(/[^\d+]/g, ''))))
    .filter(p => p.replace(/\D/g, '').length >= 8 && p.replace(/\D/g, '').length <= 15).slice(0, 5);
  const whatsapp = uniq([...html.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=|whatsapp\.com\/send\?phone=)\/?(\+?\d{8,15})/gi)].map(m => m[1])).slice(0, 3);
  const instagram = uniq([...html.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)].map(m => m[1].toLowerCase()))
    .filter(h => !['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'sharer', 'share', 'tv', 'direct'].includes(h)).slice(0, 3);
  const facebook = uniq([...html.matchAll(/facebook\.com\/([A-Za-z0-9._-]{2,60})/gi)].map(m => m[1]))
    .filter(h => !['sharer', 'share', 'sharer.php', 'plugins', 'dialog', 'login', 'tr', 'profile.php', 'pages', 'groups', 'hashtag', 'events', 'photo.php'].includes(h.toLowerCase())).slice(0, 3);
  return { emails, phones, whatsapp, instagram, facebook };
}

async function readPage(u: URL): Promise<Page | null> {
  let r: Response;
  try {
    r = await fetch(u.toString(), { redirect: 'follow', signal: AbortSignal.timeout(FETCH_MS), headers: { 'user-agent': 'Mozilla/5.0 (compatible; DailyOffice buyer research; +https://dailyoffice.aryadesigns.co.in)', accept: 'text/html,application/xhtml+xml' } });
  } catch { return null; }
  if (!r.ok) return null;
  const finalUrl = publicHttpUrl(r.url || u.toString());
  if (!finalUrl) return null;
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
  const html = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, got));
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)?.[1] || '').slice(0, 400);
  const links: { href: string; text: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= 300) break;
    links.push({ href: decode(m[1]), text: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  const text = decode(html.replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article|header|footer)>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
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
  if (!c) return p;
  const merge = (a: string[], b: string[]) => uniq([...a, ...b]).slice(0, 5);
  return { ...p, text: `${p.text}\n\n[CONTACT PAGE]\n${c.text.slice(0, 3000)}`, contacts: { emails: merge(p.contacts.emails, c.contacts.emails), phones: merge(p.contacts.phones, c.contacts.phones), whatsapp: merge(p.contacts.whatsapp, c.contacts.whatsapp), instagram: merge(p.contacts.instagram, c.contacts.instagram), facebook: merge(p.contacts.facebook, c.contacts.facebook) } };
}

// ── Search providers ────────────────────────────────────────────────────────
interface Hit { url: string; title: string; snippet: string }
interface SearchCfg { provider: 'brave' | 'google'; key: string; cx: string }

async function loadSearchCfg(): Promise<SearchCfg | null> {
  const provider = (await getSecret('search_api_provider')) as SearchCfg['provider'] | null;
  const key = await getSecret('search_api_key');
  if (!provider || !key || !['brave', 'google'].includes(provider)) return null;
  return { provider, key, cx: (await getSecret('search_api_cx')) || '' };
}

async function webSearch(cfg: SearchCfg, q: string): Promise<Hit[]> {
  if (cfg.provider === 'brave') {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: String(RESULTS_PER_QUERY * 2), search_lang: 'en', safesearch: 'off', text_decorations: 'false' })}`, {
      headers: { accept: 'application/json', 'x-subscription-token': cfg.key }, signal: AbortSignal.timeout(FETCH_MS),
    });
    if (r.status === 401 || r.status === 403) throw new Error('search_key_rejected');
    if (r.status === 429) throw new Error('search_rate_limited');
    if (!r.ok) throw new Error(`search ${r.status}`);
    const d = await r.json();
    return (d?.web?.results || []).map((x: any) => ({ url: String(x.url || ''), title: String(x.title || ''), snippet: String(x.description || '') }));
  }
  const r = await fetch(`https://www.googleapis.com/customsearch/v1?${new URLSearchParams({ key: cfg.key, cx: cfg.cx, q, num: String(RESULTS_PER_QUERY) })}`, { signal: AbortSignal.timeout(FETCH_MS) });
  if (r.status === 400 || r.status === 403) throw new Error('search_key_rejected');
  if (r.status === 429) throw new Error('search_rate_limited');
  if (!r.ok) throw new Error(`search ${r.status}`);
  const d = await r.json();
  return (d?.items || []).map((x: any) => ({ url: String(x.link || ''), title: String(x.title || ''), snippet: String(x.snippet || '') }));
}
const searchErrorText = (e: unknown) => {
  const m = String((e as Error)?.message || e);
  if (m === 'search_key_rejected') return 'The search API key was rejected — an admin can replace it in Client Finder → Buyers';
  if (m === 'search_rate_limited') return 'The search API rate limit was hit — wait a minute and resume';
  return `Search failed: ${m.slice(0, 120)}`;
};

// ── The model ───────────────────────────────────────────────────────────────
async function askModel(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<{ data: any; usage: any; model: string }> {
  const apiKey = await getSecret('anthropic_api_key');
  if (!apiKey) throw new Error('No Anthropic API key — an admin can add one in Settings → Listing AI');
  const model = await getModel();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: user }], output_config: { format: { type: 'json_schema', schema } } }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('The Anthropic API key was rejected — update it in Settings → Listing AI');
  if (r.status === 429) throw new Error('Anthropic rate limit hit — wait a minute and resume');
  if (r.status >= 400) throw new Error(String(data?.error?.message || `Anthropic API error (${r.status})`));
  if (data?.stop_reason === 'refusal') throw new Error('The model declined this page');
  const text = (data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { throw new Error('The model returned nothing usable'); }
  return { data: parsed, usage: data?.usage || {}, model };
}

const BUSINESS = 'Arya Designs is an Indian ethnic-wear manufacturer and wholesaler in Surat (lehenga cholis, sarees, kurta sets, gowns, co-ords, under the brands ARYA and DRESSTIVE). It sells to retailers, boutiques, online sellers and wholesalers anywhere in the world.';

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
You profile a BUYER website (a shop that could stock Arya's garments) from its homepage text, and write web search queries that would surface OTHER businesses of the same kind anywhere in the world — same products, same customer, similar size — never the same brand.
Rules: describe only what the page shows; is_buyer is false when the site is itself a manufacturer/wholesaler like Arya, a marketplace, a blog, a directory or unrelated. Queries are plain search phrases a person would type (product + business type + place or diaspora market, e.g. "indian lehenga boutique Leicester", "desi bridal wear store New Jersey", "saree shop online UK"); vary the product, the business word and the geography; no quotes, no operators, no brand names.`;

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
You judge whether a website is a BUYER like the seed buyer described — a shop, boutique, retailer or online store that could stock Arya's garments — and read its contact details.
Rules:
- is_buyer true only for a business that SELLS such garments to end customers or retailers and is not the seed's own brand, not a manufacturer/wholesaler like Arya, not a marketplace, directory, blog, news site or software.
- score: 0-100 how closely it matches the seed buyer (same products and customer = 80+, related products = 50-70, weak = under 40).
- name/city/country from the page; empty string when not shown. Never guess a city.
- Contact fields: choose ONLY from the candidate contacts listed (copy them exactly) and leave a field empty when no candidate fits. Prefer the business's own email over a generic provider's abuse/support address; pick the main phone.
- queries: up to ${HOP_QUERIES} plain search phrases to find more shops like THIS one (its products + business word + its city/region or diaspora market); empty when not a buyer.
- reason: one plain sentence a salesperson can read.`;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const pageBlock = (p: Page) => `URL: ${p.url}\nTITLE: ${p.title}\nDESCRIPTION: ${p.description}\nPAGE TEXT:\n${clip(p.text, 7000)}`;
const contactsBlock = (c: Contacts) => `CANDIDATE CONTACTS (found in the page code)\nemails: ${c.emails.join(', ') || '(none)'}\nphones: ${c.phones.join(', ') || '(none)'}\nwhatsapp: ${c.whatsapp.join(', ') || '(none)'}\ninstagram: ${c.instagram.join(', ') || '(none)'}\nfacebook: ${c.facebook.join(', ') || '(none)'}`;
const str = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
// Contact values the model returns must be ones we actually read off the page.
const pickFrom = (v: unknown, allowed: string[]) => { const s = str(v, 120); return allowed.some(a => a.toLowerCase() === s.toLowerCase()) ? s : ''; };

// ── Queue helpers ───────────────────────────────────────────────────────────
async function enqueue(runId: string, hits: Hit[], hop: number, parent: string, query: string, seedDomain: string): Promise<number> {
  const rows: any[] = []; const seen = new Set<string>();
  for (const h of hits) {
    const u = publicHttpUrl(h.url); if (!u) continue;
    const d = domainOf(u);
    if (seen.has(d) || d === seedDomain || isBlocked(d)) continue;
    seen.add(d);
    rows.push({ run_id: runId, domain: d, url: `${u.protocol}//${u.host}/`, hop, parent_domain: parent, via_query: clip(query, 120), state: 'pending' });
  }
  if (!rows.length) return 0;
  // Known leads from earlier runs are not re-read: they go straight to 'skipped'.
  const known: { domain: string }[] = await rest(`buyer_leads?select=domain&domain=in.(${rows.map(r => `"${r.domain}"`).join(',')})`);
  const knownSet = new Set(known.map(k => k.domain));
  for (const r of rows) if (knownSet.has(r.domain)) { r.state = 'skipped'; r.note = 'already a lead'; }
  // on_conflict=run_id,domain + ignore-duplicates: a domain surfaced by two
  // queries stays at the hop it was first seen.
  const ins = await fetch(`${SB_URL}/rest/v1/buyer_queue?on_conflict=run_id,domain`, { method: 'POST', headers: { ...svcHeaders, prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });
  const inserted = ins.ok ? await ins.json().catch(() => []) : [];
  if (!ins.ok) throw new Error(`db ${ins.status} buyer_queue`);
  return (inserted as any[]).filter(r => r.state === 'pending').length;
}

// Runs the queries for one node, with Brave's 1 request/second in mind.
async function expand(run: any, cfg: SearchCfg, queries: string[], hop: number, parent: string): Promise<{ added: number; used: number }> {
  let added = 0, used = 0;
  for (const q of queries) {
    if (run.queries_used + used >= MAX_QUERIES_PER_RUN) break;
    if (used > 0 && cfg.provider === 'brave') await new Promise(res => setTimeout(res, 1100));
    const hits = await webSearch(cfg, q);
    used += 1;
    added += await enqueue(run.id, hits, hop, parent, q, run.seed_domain);
  }
  return { added, used };
}

// ── Actions ─────────────────────────────────────────────────────────────────
async function start(who: { id: string; role: string }, body: any, req: Request): Promise<Response> {
  const seed = publicHttpUrl(str(body.seed_url, 500));
  if (!seed) return fail(400, 'Enter the buyer\'s website, e.g. www.theirshop.com', req);
  const maxDepth = Math.min(3, Math.max(1, Number(body.max_depth) || 2));
  const maxLeads = Math.min(500, Math.max(10, Number(body.max_leads) || 150));
  const cfg = await loadSearchCfg();
  if (!cfg) return fail(400, 'No search API key yet — an admin adds one below (Brave Search or Google Programmable Search)', req);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await rest(`buyer_runs?select=id&created_by=eq.${who.id}&created_at=gte.${since}`);
  if (recent.length >= RUNS_PER_USER_PER_DAY) return fail(429, `Daily limit reached — ${RUNS_PER_USER_PER_DAY} runs per person per day`, req);
  const page = await readPage(seed);
  if (!page) return fail(400, 'That website could not be read — check the address, or try its home page', req);
  const seedDomain = page.domain;
  const { data: prof, usage } = await askModel(PROFILE_SYSTEM, `${pageBlock(page)}\n\nWrite the buyer profile and ${SEED_QUERIES} search queries as JSON.`, PROFILE_SCHEMA, 1500);
  const profile = { business_name: str(prof.business_name), what_they_sell: str(prof.what_they_sell, 300), segment: str(prof.segment), customer: str(prof.customer, 200), city: str(prof.city, 80), country: str(prof.country, 80), is_buyer: !!prof.is_buyer, why: str(prof.why, 300), queries: (Array.isArray(prof.queries) ? prof.queries : []).map((q: unknown) => str(q, 120)).filter(Boolean).slice(0, SEED_QUERIES), usage };
  if (!profile.queries.length) return fail(502, 'The model could not write search queries for this site — try a different buyer', req, profile.why);
  const [run] = await rest('buyer_runs', { method: 'POST', prefer: 'return=representation', body: JSON.stringify({ created_by: who.id, seed_url: page.url, seed_domain: seedDomain, profile, max_depth: maxDepth, max_leads: maxLeads, pages_fetched: 1, step_note: profile.is_buyer ? 'Profiled the seed — searching next' : 'Note: the seed does not read as a buyer itself; searching anyway' }) });
  // The seed's queries run on the first step, so Start returns fast.
  await rest('buyer_queue', { method: 'POST', body: JSON.stringify({ run_id: run.id, domain: seedDomain, url: page.url, hop: 0, state: 'pending', note: 'seed' }) });
  return json({ ok: true, run }, req);
}

async function step(who: { id: string }, body: any, req: Request): Promise<Response> {
  const runId = str(body.run_id, 40);
  if (!/^[0-9a-f-]{36}$/.test(runId)) return fail(400, 'Missing run', req);
  const run = (await rest(`buyer_runs?id=eq.${runId}&select=*`))?.[0];
  if (!run) return fail(404, 'Run not found', req);
  if (run.status !== 'running') return json({ ok: true, run, done: run.status !== 'paused' }, req);
  const finish = async (status: string, note: string) => { await patchRun(runId, { status, step_note: note }); return json({ ok: true, run: { ...run, status, step_note: note }, done: true }, req); };
  if (run.leads_found >= run.max_leads) return finish('done', `Reached ${run.max_leads} leads`);
  if (run.pages_fetched >= MAX_PAGES_PER_RUN) return finish('done', `Read ${MAX_PAGES_PER_RUN} sites — the cap for one run`);
  const item = (await rest(`buyer_queue?run_id=eq.${runId}&state=eq.pending&order=hop.asc,created_at.asc&limit=1&select=*`))?.[0];
  if (!item) return finish('done', run.queries_used >= MAX_QUERIES_PER_RUN ? `Used the ${MAX_QUERIES_PER_RUN}-search cap for one run` : 'Nothing left to check');
  const cfg = await loadSearchCfg();
  if (!cfg) return fail(400, 'The search API key is gone — an admin can add it again', req);
  const setItem = (state: string, note: string) => rest(`buyer_queue?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ state, note: clip(note, 200) }) });

  try {
    // Hop 0 is the seed itself: run its queries, nothing to judge.
    if (item.hop === 0) {
      const { added, used } = await expand(run, cfg, run.profile?.queries || [], 1, run.seed_domain);
      await setItem('accepted', 'seed');
      const patch = { queries_used: run.queries_used + used, step_note: `Searched ${used} queries — ${added} sites to check` };
      await patchRun(runId, patch);
      return json({ ok: true, run: { ...run, ...patch }, done: false, item: { domain: item.domain, hop: 0, result: 'searched', added } }, req);
    }
    const target = publicHttpUrl(item.url);
    const page0 = target ? await readPage(target) : null;
    if (!page0) {
      await setItem('skipped', 'unreachable');
      const patch = { pages_fetched: run.pages_fetched + 1, step_note: `${item.domain}: could not be read` };
      await patchRun(runId, patch);
      return json({ ok: true, run: { ...run, ...patch }, done: false, item: { domain: item.domain, hop: item.hop, result: 'unreachable' } }, req);
    }
    const page = await withContactPage(page0);
    const seedP = run.profile || {};
    const user = `SEED BUYER (what we are looking for more of)\nname: ${seedP.business_name}\nsells: ${seedP.what_they_sell}\nsegment: ${seedP.segment}\ncustomer: ${seedP.customer}\nplace: ${[seedP.city, seedP.country].filter(Boolean).join(', ')}\n\nCANDIDATE SITE\n${pageBlock(page)}\n\n${contactsBlock(page.contacts)}\n\nJudge the candidate as JSON.`;
    const { data: v, usage } = await askModel(JUDGE_SYSTEM, user, JUDGE_SCHEMA, 900);
    const score = Math.max(0, Math.min(100, Math.round(Number(v.score) || 0)));
    const accepted = !!v.is_buyer && score >= MIN_ACCEPT_SCORE;
    let patch: Record<string, unknown> = { pages_fetched: run.pages_fetched + 1 };
    let added = 0, used = 0;
    if (accepted) {
      const lead = {
        domain: page.domain, url: page.url, name: str(v.name, 120) || page.title.slice(0, 120), kind: str(v.kind, 30) || 'other', what_they_sell: str(v.what_they_sell, 300),
        city: str(v.city, 80), country: str(v.country, 80), score, reason: str(v.reason, 400), hop: item.hop, parent_domain: item.parent_domain,
        email: pickFrom(v.email, page.contacts.emails) || page.contacts.emails[0] || null, phone: pickFrom(v.phone, page.contacts.phones) || page.contacts.phones[0] || null,
        whatsapp: pickFrom(v.whatsapp, page.contacts.whatsapp) || page.contacts.whatsapp[0] || null, instagram: pickFrom(v.instagram, page.contacts.instagram) || page.contacts.instagram[0] || null,
        facebook: pickFrom(v.facebook, page.contacts.facebook) || page.contacts.facebook[0] || null, first_run_id: runId, found_by: who.id, updated_at: new Date().toISOString(),
      };
      // ignore-duplicates: a domain that became a lead in a parallel step keeps its first record.
      const ins = await fetch(`${SB_URL}/rest/v1/buyer_leads?on_conflict=domain`, { method: 'POST', headers: { ...svcHeaders, prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(lead) });
      if (!ins.ok) throw new Error(`db ${ins.status} buyer_leads: ${(await ins.text()).slice(0, 200)}`);
      const wrote = ((await ins.json().catch(() => [])) as any[]).length > 0;
      await setItem('accepted', `${score} — ${lead.reason}`);
      patch = { ...patch, leads_found: run.leads_found + (wrote ? 1 : 0) };
      if (item.hop < run.max_depth) {
        const qs = (Array.isArray(v.queries) ? v.queries : []).map((q: unknown) => str(q, 120)).filter(Boolean).slice(0, HOP_QUERIES);
        ({ added, used } = await expand({ ...run, queries_used: run.queries_used }, cfg, qs, item.hop + 1, page.domain));
        patch = { ...patch, queries_used: run.queries_used + used };
      }
      patch = { ...patch, step_note: `${lead.name || page.domain}: buyer (${score})${added ? ` — ${added} more to check` : ''}` };
    } else {
      await setItem('rejected', `${score} — ${str(v.reason, 160)}`);
      patch = { ...patch, step_note: `${page.domain}: not a buyer (${score})` };
    }
    await patchRun(runId, patch);
    return json({ ok: true, run: { ...run, ...patch }, done: false, item: { domain: page.domain, hop: item.hop, result: accepted ? 'lead' : 'rejected', score, added }, usage }, req);
  } catch (e) {
    const m = String((e as Error)?.message || e);
    const friendly = /^search/.test(m) ? searchErrorText(e) : m.slice(0, 300);
    // A key/rate problem pauses the run so the next tap can resume; a single
    // bad site is marked failed and the loop moves on.
    const pauseWorthy = /search_key_rejected|search_rate_limited|Anthropic|API key|rate limit/i.test(m);
    if (pauseWorthy) { await patchRun(runId, { status: 'paused', last_error: friendly, step_note: friendly }); return fail(502, friendly, req); }
    await setItem('failed', friendly);
    const patch = { pages_fetched: run.pages_fetched + 1, last_error: friendly, step_note: `${item.domain}: ${friendly}` };
    await patchRun(runId, patch);
    return json({ ok: true, run: { ...run, ...patch }, done: false, item: { domain: item.domain, hop: item.hop, result: 'failed' } }, req);
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
      return json({ ok: true, searchProvider: cfg?.provider || null, hasAiKey: !!(await getSecret('anthropic_api_key')), model: await getModel(), role: who.role, caps: { runsPerDay: RUNS_PER_USER_PER_DAY, queriesPerRun: MAX_QUERIES_PER_RUN, pagesPerRun: MAX_PAGES_PER_RUN } }, req);
    }
    if (action === 'set_search_key') {
      if (who.role !== 'admin') return fail(403, 'Only an admin can set the search API key', req);
      const provider = str(body.provider, 10) as SearchCfg['provider'];
      const key = str(body.key, 200); const cx = str(body.cx, 100);
      if (!['brave', 'google'].includes(provider)) return fail(400, 'Pick Brave or Google', req);
      if (!key) return fail(400, 'Paste the API key first', req);
      if (provider === 'google' && !cx) return fail(400, 'Google also needs the Programmable Search Engine id (cx)', req);
      // One real query before storing: a bad key is refused here, not mid-run.
      try { await webSearch({ provider, key, cx }, 'indian clothing boutique'); } catch (e) { return fail(400, searchErrorText(e), req); }
      await setSecret('search_api_provider', provider); await setSecret('search_api_key', key); await setSecret('search_api_cx', cx);
      return json({ ok: true, searchProvider: provider }, req);
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
      await patchRun(runId, { status: action === 'pause' ? 'paused' : 'running', last_error: null, step_note: action === 'pause' ? 'Paused' : 'Resumed' });
      return json({ ok: true }, req);
    }
    return fail(400, 'Unknown action', req);
  } catch (e) {
    return fail(500, String((e as Error)?.message || e).slice(0, 300), req);
  }
});

// Pure helpers, exported for the repo's node harness only (unused at runtime).
export const __test = { publicHttpUrl, extractContacts, isBlocked, domainOf };
