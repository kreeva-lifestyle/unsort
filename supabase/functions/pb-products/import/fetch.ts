// Polite HTTP to another store. Per redirect hop (at most 3) — and for the
// first address too when it came from the store's data (photos) — the address
// passes checkUrl (https, public name, never one of our own sites —
// setOwnDomains); the first address of a page fetch is the run's own host,
// checked when the run was started. On every request its DNS answers must be
// public (where the runtime can resolve them), and robots.txt must allow the
// path when `robots` is given for that site.
// Pacing is per host and booked, so callers running at the same time still
// queue: the store itself ≥ 1 s apart (or its Crawl-delay, up to 10 s,
// setPace), other hosts (image CDNs) 250 ms. Our plain User-Agent, 20 s per
// request, 3 MB per body (a bigger body is a 413, never half a page).
// 429 / 430 / 503 throw RateLimited: the caller waits instead of retrying.
// Gap left open: DNS can change between the check and the fetch (rebinding);
// the edge runtime cannot pin the resolved address.
import { HttpError } from '../http.ts';
import { ROBOTS_NO, type Robots, USER_AGENT, checkUrl, publicIp, robotsAllow, sameSite } from './urlCheck.ts';

export const REQUEST_MS = 20_000;
const MAX_BODY = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const OTHER_HOST_MS = 250;

/** The store asked us to slow down (429 / 430 / 503): wait `retryAfter` seconds, do not count it as an error. */
export class RateLimited extends HttpError {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(503, 'The store asked Playbook to slow down — try again in a few minutes.');
    this.retryAfter = retryAfter;
  }
}

const key = (host: string) => host.toLowerCase().replace(/^www\./, '');
const lastAt = new Map<string, number>();
const gapOf = new Map<string, number>();
/** The store's own gap (its robots.txt Crawl-delay, clamped to 1–10 s). */
export function setPace(host: string, ms: number) { gapOf.set(key(host), Math.min(10_000, Math.max(1_000, ms || 1_000))); }

/** Book the next slot for `host` and wait for it (one caller per slot, even when several wait at once). */
export async function pace(host: string, minMs = 1_000): Promise<void> {
  const k = key(host);
  const at = Math.max(Date.now(), (lastAt.get(k) ?? 0) + Math.max(minMs, gapOf.get(k) ?? 0));
  lastAt.set(k, at);
  const wait = at - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

type Dns = { resolveDns?: (h: string, t: 'A' | 'AAAA') => Promise<string[]> };
const dnsOk = new Map<string, number>();
/** Refuse a public-looking name that points into a private network (checked once a minute per host). */
async function resolvesPublic(host: string): Promise<void> {
  const D = (globalThis as unknown as { Deno?: Dns }).Deno;
  if (!D || typeof D.resolveDns !== 'function' || (dnsOk.get(host) ?? 0) > Date.now() - 60_000) return;
  const ips = (await Promise.all((['A', 'AAAA'] as const).map(t => D.resolveDns!(host, t).catch(() => [] as string[])))).flat();
  if (ips.some(ip => !publicIp(ip))) throw new HttpError(400, 'That address is not a public website.');
  dnsOk.set(host, Date.now());
}

export interface Got { status: number; ok: boolean; url: string; text: string; headers: Headers }
export interface GetOpts {
  accept?: string; timeoutMs?: number;
  robots?: Robots;      // refuse paths its rules disallow (on robots.host, every hop)
  sameOrigin?: boolean; // stop (ok:false) at a redirect to another site
  minMs?: number;       // pacing for this host (default 1 s)
  checkFirst?: boolean; // the first address came from the store's data: checkUrl it too
}

/** The response after redirects, body unread; null = stopped (too many hops, or off-site with sameOrigin). */
async function request(url: string, o: GetOpts): Promise<{ r: Response | null; url: string }> {
  let at = url;
  for (let hop = 0; ; hop++) {
    const chk = hop || o.checkFirst ? checkUrl(at) : { ok: true as const };
    if (!chk.ok) throw new HttpError(400, hop ? `The website sends visitors to an address Playbook cannot use: ${chk.error}` : chk.error);
    const u = new URL(at);
    if (hop && o.sameOrigin && !sameSite(at, url)) return { r: null, url: at };
    if (o.robots?.host && sameSite(at, `https://${o.robots.host}`) && !robotsAllow(o.robots, u.pathname + u.search)) throw new HttpError(400, ROBOTS_NO);
    await resolvesPublic(u.hostname);
    await pace(u.hostname, o.minMs);
    const r = await fetch(at, {
      redirect: 'manual', signal: AbortSignal.timeout(o.timeoutMs ?? REQUEST_MS),
      headers: { 'user-agent': USER_AGENT, accept: o.accept ?? 'application/json, text/html;q=0.9, */*;q=0.5', 'accept-language': 'en-IN,en;q=0.8' },
    });
    if ([429, 430, 503].includes(r.status)) {
      await r.body?.cancel();
      const s = Number(r.headers.get('retry-after'));
      throw new RateLimited(Math.min(600, Math.max(30, Number.isFinite(s) && s > 0 ? s : 60)));
    }
    if (![301, 302, 303, 307, 308].includes(r.status)) return { r, url: at };
    await r.body?.cancel();
    const loc = r.headers.get('location');
    if (!loc || hop >= MAX_REDIRECTS) return { r: null, url: at };
    at = new URL(loc, at).toString();
  }
}

/** The body as bytes, stopping at `max` (cut = it was bigger). */
async function readBytes(r: Response, max: number): Promise<{ bytes: Uint8Array; cut: boolean }> {
  if (Number(r.headers.get('content-length') || 0) > max) { await r.body?.cancel(); return { bytes: new Uint8Array(), cut: true }; }
  if (!r.body) return { bytes: new Uint8Array(), cut: false };
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); return { bytes: new Uint8Array(), cut: true }; }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  return { bytes, cut: false };
}

/** GET `url` politely as text. A body over 3 MB comes back as status 413, ok false. */
export async function siteGet(url: string, o: GetOpts = {}): Promise<Got> {
  const { r, url: at } = await request(url, o);
  if (!r) return { status: 0, ok: false, url: at, text: '', headers: new Headers() };
  const { bytes, cut } = await readBytes(r, MAX_BODY);
  if (cut) return { status: 413, ok: false, url: at, text: '', headers: r.headers };
  return { status: r.status, ok: r.ok, url: at, text: new TextDecoder().decode(bytes), headers: r.headers };
}

/** GET a photo for an import: same checks; paced 1 s on the store's own host (`store`), 250 ms elsewhere. */
export async function siteBytes(url: string, max: number, store: string): Promise<{ status: number; ok: boolean; bytes: Uint8Array }> {
  const own = sameSite(url, `https://${store}`);
  const { r } = await request(url, { accept: 'image/*', timeoutMs: 25_000, minMs: own ? 1_000 : OTHER_HOST_MS, checkFirst: true });
  if (!r) return { status: 0, ok: false, bytes: new Uint8Array() };
  if (!r.ok) { await r.body?.cancel(); return { status: r.status, ok: false, bytes: new Uint8Array() }; }
  const { bytes, cut } = await readBytes(r, max);
  return cut ? { status: 413, ok: false, bytes } : { status: r.status, ok: true, bytes };
}

/** GET and parse JSON; null when it is not JSON (an HTML "not found" page, a bot wall). */
export async function siteJson<T>(url: string, o: GetOpts = {}): Promise<{ data: T | null; got: Got }> {
  const got = await siteGet(url, { accept: 'application/json', ...o });
  if (!got.ok) return { data: null, got };
  try { return { data: JSON.parse(got.text) as T, got }; } catch { return { data: null, got }; }
}

/** The sentence saved on a run for a request that failed: our own sentences as they are, never raw network text. */
export function pageError(e: unknown, what: string): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof DOMException) return `${what} took longer than 20 seconds to answer.`;
  return `${what} could not be reached.`;
}
