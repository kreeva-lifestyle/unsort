// The two escaping jobs the app needs, in one place. Thirteen local copies
// used to exist with three incompatible behaviours; picking the wrong one by
// name was an XSS (HTML) or formula-injection (CSV) footgun.

/** For values interpolated into print / PDF HTML templates. */
export const escHtml = (s: unknown): string =>
  String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));

/** For one CSV cell: always quoted, quotes doubled, and a leading =+-@ or
 *  tab/CR prefixed with an apostrophe so spreadsheets never execute it. */
export const csvCell = (v: unknown): string => {
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
