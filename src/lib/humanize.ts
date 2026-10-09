// Small human-facing formatters shared across modules (Jobwork, Purchase
// Orders): a moment on the phone's own clock, and a person's initials.

/** A moment, in the phone's own clock: "09 Oct, 03:06 pm". */
export const fmtWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** "Manav Bhalala" → "MB", "Manthan" → "M", an email → its first letter. */
export const initials = (name: string): string =>
  name.split('@')[0].trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
