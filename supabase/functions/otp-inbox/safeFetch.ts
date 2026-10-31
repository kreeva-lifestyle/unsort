// Guarded fetch for links taken from SMS text (security audit 2026-10-31).
//
// The delivery-sheet link comes from an SMS anyone can send to the owner's
// phone, so it is untrusted: before this, the function fetched whatever URL
// the text held — any host, any port, internal addresses, redirects followed
// blindly, no timeout, the whole body buffered before the size check.
// Now every hop (the link and each redirect) must be plain http(s) on the
// normal ports, to a public DNS name (no IP literals, no localhost/.internal
// names, nothing that resolves to a private range), with a hard timeout and a
// streaming byte cap. Real courier links (Shadowfax, Delhivery…) pass all of it.

const PRIVATE_IP = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.0\.|198\.1[89]\.|22[4-9]\.|2[3-5]\d\.)/;
const PRIVATE_V6 = /^(::1?$|f[cd]|fe[89ab]|::ffff:)/i;

export class UnsafeLink extends Error {}

function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UnsafeLink('not a valid link'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeLink('only web links are opened');
  if (u.username || u.password) throw new UnsafeLink('links with a login are not opened');
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeLink('unusual port');
  const host = u.hostname.toLowerCase();
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) throw new UnsafeLink('links to an IP address are not opened');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) throw new UnsafeLink('internal address');
  return u;
}

// Resolve and refuse private answers. If the runtime cannot resolve at all
// the hostname rules above still apply (IP literals and internal names are
// already refused).
async function checkDns(host: string): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const resolve = (Deno as any).resolveDns as ((h: string, t: string) => Promise<string[]>) | undefined;
  if (typeof resolve !== 'function') return;
  const answers: string[] = [];
  for (const t of ['A', 'AAAA']) { try { answers.push(...await resolve(host, t)); } catch { /* no record of this type */ } }
  if (answers.some(ip => PRIVATE_IP.test(ip) || PRIVATE_V6.test(ip))) throw new UnsafeLink('internal address');
}

export async function safeFetchBytes(link: string, maxBytes: number, timeoutMs = 20_000): Promise<{ status: number; ok: boolean; ctype: string; bytes: Uint8Array | null; tooLarge: boolean }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = checkUrl(link);
  for (let hop = 0; hop <= 5; hop++) {
    await checkDns(url.hostname);
    const res = await fetch(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      await res.body?.cancel();
      if (!loc) return { status: res.status, ok: false, ctype: '', bytes: null, tooLarge: false };
      url = checkUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) { await res.body?.cancel(); return { status: res.status, ok: false, ctype: '', bytes: null, tooLarge: false }; }
    const ctype = res.headers.get('content-type') || '';
    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, ok: true, ctype, bytes: new Uint8Array(), tooLarge: false };
    const parts: Uint8Array[] = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); return { status: res.status, ok: true, ctype, bytes: null, tooLarge: true }; }
      parts.push(value);
    }
    const bytes = new Uint8Array(total); let off = 0;
    for (const p of parts) { bytes.set(p, off); off += p.byteLength; }
    return { status: res.status, ok: true, ctype, bytes, tooLarge: false };
  }
  throw new UnsafeLink('too many redirects');
}
