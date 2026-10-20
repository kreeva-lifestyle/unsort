// The last few error messages this screen showed or hit, kept in memory so a
// "Report a problem" can say what went wrong without the user typing it.
// Fed by friendlyError (errors shown in toasts / forms) and errorLogger
// (unhandled ones). Never sent anywhere on its own.
const MAX = 10;
const list: { at: string; message: string }[] = [];

export function noteError(message: string): void {
  const m = String(message || '').trim().slice(0, 300);
  if (!m) return;
  list.push({ at: new Date().toISOString(), message: m });
  if (list.length > MAX) list.shift();
}

export const recentErrors = () => list.slice();
