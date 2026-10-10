// Small human-facing formatters shared across modules (Jobwork, Purchase
// Orders): a moment on the phone's own clock, and a person's initials.

/** A moment, in the phone's own clock: "09 Oct, 03:06 pm" — with the year
 *  once it is not this year ("09 Oct 2025, 03:06 pm"), so an old trail
 *  never reads as recent. */
export const fmtWhen = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', ...(thisYear ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });
};

/** "Manav Bhalala" → "MB", "Manthan" → "M", an email → its first letter. */
export const initials = (name: string): string =>
  name.split('@')[0].trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
