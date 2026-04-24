// Shared helper to translate raw Supabase / Postgres error messages into human copy.
// Audit P2: the app was surfacing raw "duplicate key value violates unique constraint..."
// style strings via alert() and addToast(). Map the common cases to plain language,
// send the raw text to console.error so devs can still debug.

export function friendlyError(raw: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg = String((raw as { message?: string } | undefined)?.message ?? raw ?? '').trim();
  const code = ((raw as { code?: string } | undefined)?.code ?? '').toString();
  if (msg) console.error('[app error]', code || '(no code)', msg);
  if (!msg) return fallback;
  const l = msg.toLowerCase();

  // Postgres constraint violations
  if (code === '23505' || l.includes('duplicate key')) return 'A record with these details already exists.';
  if (code === '23503' || l.includes('foreign key')) return 'Cannot complete — this item is still referenced elsewhere.';
  if (l.includes('confirmed cash handover period') || l.includes('confirmed and is a permanent') || l.includes('permanent financial record')) return msg; // Pass through specific lock-period errors
  if (code === '23514' || l.includes('check constraint')) return 'One of the values is outside the allowed range.';
  if (code === '23502' || l.includes('not null')) return 'A required field is missing.';

  // Permissions / RLS
  if (code === '42501' || l.includes('permission denied') || l.includes('rls') || l.includes('row-level security')) {
    return 'You don\'t have permission to do that. Ask an admin if you need access.';
  }
  if (code === 'PGRST301' || l.includes('jwt') && l.includes('expired')) return 'Your session expired. Please sign in again.';

  // Auth (Supabase gotrue)
  if (l.includes('invalid login')) return 'Incorrect email or password. Please try again.';
  if (l.includes('email not confirmed')) return 'Email not confirmed. Ask your admin to re-invite you.';
  if (l.includes('rate limit') || l.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  if (l.includes('user already registered')) return 'This email is already registered.';

  // Network
  if (l.includes('failed to fetch') || l.includes('network') || l.includes('econnrefused')) {
    return 'Network error. Check your connection and try again.';
  }
  if (l.includes('timeout')) return 'Request timed out. Please try again.';

  // Leave reasonable messages alone, otherwise fall back
  if (msg.length < 80 && !/[{<]/.test(msg)) return msg;
  return fallback;
}
