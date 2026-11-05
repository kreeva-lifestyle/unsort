// Who may call: the pg_cron worker / Telegram bridge with the shared secret
// (header x-sync-secret = app_secrets.pb_worker_secret — the packtime
// pattern), or a signed-in ACTIVE admin / manager / operator (Bearer JWT →
// /auth/v1/user → profiles.role, is_active).
import { SB_URL, svcHeaders, enc, getSecret, one } from './db.ts';
import type { Caller } from './types.ts';

const STAFF = ['admin', 'manager', 'operator'];

function secretOk(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function schedulerOk(req: Request): Promise<boolean> {
  const given = req.headers.get('x-sync-secret') || '';
  if (!given) return false;
  return secretOk(given, (await getSecret('pb_worker_secret')) || '');
}

async function staff(req: Request): Promise<Caller | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: svcHeaders.apikey } });
  if (!u.ok) return null;
  const user = await u.json().catch(() => null) as { id?: string } | null;
  if (!user?.id) return null;
  const prof = await one<{ role: string | null; is_active: boolean | null }>(`profiles?id=eq.${enc(user.id)}&select=role,is_active`).catch(() => null);
  if (!prof || prof.is_active === false || !prof.role || !STAFF.includes(prof.role)) return null;
  return { kind: 'staff', id: user.id, role: prof.role };
}

export async function whoIs(req: Request): Promise<Caller | null> {
  if (req.headers.get('x-sync-secret')) return (await schedulerOk(req)) ? { kind: 'secret' } : null;
  return await staff(req);
}

/** The user id to stamp on pb_activity (null for the worker). */
export const userOf = (c: Caller) => (c.kind === 'staff' ? c.id : null);
