// Pure: is this a website Playbook may import from, and does its robots.txt
// let us? No I/O (tested with node --test). The edge function turns the
// returned sentence into an HttpError(400).
//   checkUrl(): https only, a public hostname (no IP address, localhost or
//   private / internal names), not one of our own stores (pb_websites
//   shop_domain + OWN_DOMAINS) — so staff cannot point the importer at
//   Supabase, the office network or our own Shopify.
//   robots: the group for our token (DailyOffice-Playbook) wins over the
//   '*' group (the standard); the longest matching Allow / Disallow rule
//   decides; '*' and '$' in rules are honoured. No group → allowed.

export const USER_AGENT = 'DailyOffice-Playbook/1.0 (+https://dailyoffice.aryadesigns.co.in)';
export const UA_TOKEN = 'dailyoffice-playbook';
/** Domains that are ours (never import from ourselves). */
export const OWN_DOMAINS = ['aryadesigns.co.in', 'supabase.co', 'supabase.in'];

export interface SiteUrl { origin: string; host: string; url: string }

const sub = (host: string, dom: string) => host === dom || host.endsWith(`.${dom}`);
const PRIVATE_TLD = ['localhost', 'local', 'internal', 'lan', 'home', 'corp', 'intranet', 'test', 'example', 'invalid', 'onion'];

function isIp(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return true; // 0x7f000001, 2130706433
  return host.includes(':'); // IPv6 (URL keeps the brackets: [::1])
}

/** The sentence that refuses `raw`, or the parsed site. `own` = our stores' domains (pb_websites.shop_domain). */
export function checkUrl(raw: unknown, own: string[] = []): { ok: true; site: SiteUrl } | { ok: false; error: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Type the website address, like https://example.com.' };
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`); } catch { return { ok: false, error: 'That is not a web address — use the form https://example.com.' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https:// websites can be imported.' };
  if (u.username || u.password) return { ok: false, error: 'Leave the login details out of the address.' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (isIp(host) || host.startsWith('[')) return { ok: false, error: 'Use the website\'s name, not an IP address.' };
  const labels = host.split('.');
  if (labels.length < 2 || labels.some(l => !l || !/^[a-z0-9-]+$/.test(l) || l.startsWith('-') || l.endsWith('-'))) return { ok: false, error: 'That website name does not look right.' };
  if (PRIVATE_TLD.includes(labels[labels.length - 1])) return { ok: false, error: 'That address is not a public website.' };
  if (u.port && u.port !== '443') return { ok: false, error: 'Use the website\'s normal https address, without a port number.' };
  for (const d of [...OWN_DOMAINS, ...own.map(x => String(x || '').toLowerCase().trim()).filter(Boolean)]) {
    if (sub(host, d)) return { ok: false, error: 'That is one of our own websites — import works on other stores only.' };
  }
  return { ok: true, site: { origin: `https://${host}`, host, url: `https://${host}${u.pathname === '/' ? '' : u.pathname}` } };
}

export interface Robots { rules: { allow: boolean; path: string }[]; sitemaps: string[]; crawlDelay: number | null }

/** Parse robots.txt. Keeps the rules of the most specific group that applies to us. */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let cur: typeof groups[number] | null = null;
  let lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'sitemap') { if (val) sitemaps.push(val); continue; }
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') { if (val || key === 'allow') cur.rules.push({ allow: key === 'allow', path: val }); }
    else if (key === 'crawl-delay') { const n = Number(val); if (Number.isFinite(n) && n > 0) cur.delay = n; }
  }
  const mine = groups.filter(g => g.agents.some(a => a && UA_TOKEN.startsWith(a.replace(/\/.*$/, ''))));
  const star = groups.filter(g => g.agents.includes('*'));
  const use = mine.length ? mine : star;
  return { rules: use.flatMap(g => g.rules), sitemaps, crawlDelay: use.map(g => g.delay).find(d => d !== null) ?? null };
}

function ruleRe(path: string): RegExp {
  const esc = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc.endsWith('\\$') ? esc.slice(0, -2) + '$' : esc}`);
}

/** May we fetch `path` (e.g. '/products.json')? Longest matching rule wins; Allow wins a tie. */
export function robotsAllow(r: Robots, path: string): boolean {
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of r.rules) {
    if (!rule.path) continue; // "Disallow:" (empty) = allow everything
    if (!ruleRe(rule.path).test(path)) continue;
    const len = rule.path.replace(/\$$/, '').length;
    if (!best || len > best.len || (len === best.len && rule.allow)) best = { allow: rule.allow, len };
  }
  return best ? best.allow : true;
}

/** The sentence that refuses a platform when robots.txt disallows the paths it needs, or null. */
export function robotsRefusal(r: Robots, platform: string): string | null {
  const need: Record<string, string[]> = {
    shopify: ['/products.json', '/collections/all/products.json'],
    woocommerce: ['/wp-json/wc/store/v1/products'],
    generic: ['/sitemap.xml'],
  };
  const paths = need[platform] || [];
  if (!paths.length) return null;
  if (paths.some(p => robotsAllow(r, p))) return null;
  return `This website does not allow automated access to its product list (robots.txt disallows ${paths[0]}), so Playbook will not import from it.`;
}
