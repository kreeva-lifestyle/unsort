// otp-inbox — receives OTP SMS text forwarded by an iOS Shortcut automation
// on the owner's phone (iOS gives no app direct SMS access; the Shortcut
// "Message contains OTP -> POST here" is the sanctioned bridge). Stores the
// message with the extracted code so staff see it live in the OTP Inbox Mini.
//
// POST { secret, text, device? } -> { ok, code }   (the Shortcut's push)
// POST { action: 'setup' } + user JWT -> { ok, url, secret }   (any
//   signed-in staff member - owner's call: the guide is not sensitive
//   in-house; only anonymous internet callers are refused, since the key
//   lets its holder inject OTP rows)
// Push auth: the shared secret from app_secrets.otp_push_secret - the
// Shortcut cannot do JWTs. Constant-time compare; wrong secret gets 403.
// Retention is the DB's job (purge cron); this function only ingests.

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

function secretOk(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// The OTP inside an SMS: a 4-8 digit run that is not part of a longer number
// and not an amount (Rs./INR prefix). Prefer the run nearest to an OTP-ish
// keyword; otherwise the first candidate. Returns '' when nothing matches -
// the message still stores, staff can read it whole.
export function extractOtp(text: string): string {
  const t = String(text || '');
  // No OTP-ish keyword -> no extraction at all: a bank debit alert has digit
  // runs (account masks, amounts) but none of them is a code, and guessing
  // one would show staff a wrong "OTP".
  if (!/otp|code|password|passcode|pin\b|verification/i.test(t)) return '';
  const cands: { code: string; idx: number }[] = [];
  const re = /(?<![0-9A-Za-z])([0-9]{4,8})(?![0-9])/g;   // letter-glued runs (XX1234) are ids, not codes
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 6), m.index);
    if (/(rs\.?|inr|₹)\s*$/i.test(before)) continue;   // an amount, not a code
    cands.push({ code: m[1], idx: m.index });
  }
  if (cands.length === 0) return '';
  const kw = /otp|code|password|passcode|pin\b|verification/gi;
  let best: { code: string; dist: number } | null = null;
  let k: RegExpExecArray | null;
  while ((k = kw.exec(t)) !== null) {
    for (const c of cands) {
      const dist = Math.abs(c.idx - k.index);
      if (dist <= 60 && (!best || dist < best.dist)) best = { code: c.code, dist };
    }
  }
  return best ? best.code : cands[0].code;
}

async function isSignedIn(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return false;
  const user = await u.json().catch(() => null);
  if (!user?.id) return false;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: svcHeaders });
  const prof = (await p.json().catch(() => []))?.[0];
  return !!prof && prof.is_active !== false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  let body: { secret?: string; text?: string; device?: string; action?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const sec = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.otp_push_secret&select=value`, { headers: svcHeaders });
  const expected = (await sec.json().catch(() => []))?.[0]?.value ?? '';
  if (!expected) return json({ ok: false, error: 'otp_push_secret is not configured' }, 503);

  // In-app setup guide (owner's ask): ADMINS read the URL + secret here so
  // the guide in the Mini is complete without the key ever entering the repo.
  if (body.action === 'setup') {
    if (!(await isSignedIn(req))) return json({ ok: false, error: 'Sign in to DailyOffice first' }, 403);
    return json({ ok: true, url: `${SB_URL}/functions/v1/otp-inbox`, secret: expected });
  }

  if (!secretOk(String(body.secret || ''), expected)) return json({ ok: false, error: 'forbidden' }, 403);

  const text = String(body.text || '').slice(0, 1000).trim();
  if (!text) return json({ ok: false, error: 'Empty message' }, 400);
  const code = extractOtp(text);
  const r = await fetch(`${SB_URL}/rest/v1/otp_inbox`, {
    method: 'POST', headers: svcHeaders,
    body: JSON.stringify({ message: text, code: code || null, device: String(body.device || '').slice(0, 60) || null }),
  });
  if (!r.ok) return json({ ok: false, error: `store failed (${r.status})` }, 502);
  return json({ ok: true, code });
});
