// Polite HTTP to another store: one request per second at most (per edge
// instance), our plain User-Agent, 20 s per request, 3 MB per body, https
// only, and redirects followed only while they stay on a public https host
// (never into our own network — the redirect target passes checkUrl too).
import { HttpError } from '../http.ts';
import { USER_AGENT, checkUrl } from './urlCheck.ts';

export const REQUEST_MS = 20_000;
const PACE_MS = 1_000;
const MAX_BODY = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

let lastAt = 0;
/** Wait so that requests to other sites are ≥ 1 s apart. Each caller books its own
 *  slot before waiting, so callers running at the same time (the import's product
 *  pages, three at once) still go one per second. */
export async function pace(): Promise<void> {
  const at = Math.max(Date.now(), lastAt + PACE_MS);
  lastAt = at;
  const wait = at - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

export interface Got { status: number; ok: boolean; url: string; text: string; headers: Headers }

/** GET `url` politely. A redirect to a host checkUrl refuses stops the request. */
export async function siteGet(url: string, accept = 'application/json, text/html;q=0.9, */*;q=0.5', timeoutMs = REQUEST_MS): Promise<Got> {
  let at = url;
  for (let hop = 0; ; hop++) {
    await pace();
    const r = await fetch(at, {
      redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-IN,en;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      await r.body?.cancel();
      const loc = r.headers.get('location');
      if (!loc || hop >= MAX_REDIRECTS) return { status: r.status, ok: false, url: at, text: '', headers: r.headers };
      const next = checkUrl(new URL(loc, at).toString());
      if (!next.ok) throw new HttpError(400, `The website sends visitors to an address Playbook cannot use: ${next.error}`);
      at = new URL(loc, at).toString();
      continue;
    }
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BODY) { await r.body?.cancel(); return { status: r.status, ok: false, url: at, text: '', headers: r.headers }; }
    const text = await readUpTo(r, MAX_BODY);
    return { status: r.status, ok: r.ok, url: at, text, headers: r.headers };
  }
}

async function readUpTo(r: Response, max: number): Promise<string> {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let out = '', size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); break; } // a page this big is not a product list we can use
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

/** GET and parse JSON; null when it is not JSON (an HTML "not found" page, a bot wall). */
export async function siteJson<T>(url: string): Promise<{ data: T | null; got: Got }> {
  const got = await siteGet(url, 'application/json');
  if (!got.ok) return { data: null, got };
  try { return { data: JSON.parse(got.text) as T, got }; } catch { return { data: null, got }; }
}

/** The error sentence for a page that failed (plain, no stack). */
export function pageError(e: unknown, what: string): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof DOMException) return `${what} took longer than 20 seconds to answer.`;
  return `${what} could not be read (${e instanceof Error ? e.message.slice(0, 120) : 'network error'}).`;
}
