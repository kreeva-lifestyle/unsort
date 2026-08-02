// Guard a user-supplied URL before it becomes an <a href>. Free-text link fields
// (inventory item links, program Dropbox/Drive links) can hold `javascript:` or
// `data:` URLs, which React renders and a click executes IN THIS ORIGIN — able to
// read the session token. Only http/https survive; anything else (or unparseable)
// returns undefined so the anchor renders inert. Mirrors the scheme allowlist in
// TracklyRedirect.tsx.
const ALLOWED = ['http:', 'https:'];

export function safeHref(url?: string | null): string | undefined {
  const u = (url || '').trim();
  if (!u) return undefined;
  try {
    return ALLOWED.includes(new URL(u).protocol) ? u : undefined;
  } catch {
    return undefined;
  }
}
