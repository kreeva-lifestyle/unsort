// Self-contained error tracking — writes unhandled errors to Supabase.
// Scope: ONLY unexpected/unhandled errors (render crashes, window.onerror,
// unhandledrejection). Handled errors that go through addToast(friendlyError)
// are deliberately NOT logged — they're expected and already surfaced.
import { supabase } from './supabase';

type ErrorSource = 'boundary' | 'window' | 'promise' | 'manual';

// Rate limiting — a render loop could otherwise flood the table.
const recentSignatures = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;
const SESSION_CAP = 50;
let sessionCount = 0;

// Browser noise that isn't actionable: cross-origin script errors, benign
// ResizeObserver warnings, and extension-injected failures.
const NOISE = [
  'ResizeObserver loop',
  'Script error.',
  'Non-Error promise rejection captured',
];

function isNoise(message: string): boolean {
  return NOISE.some(n => message.includes(n));
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Unknown error';
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function stackOf(err: unknown): string | null {
  if (err instanceof Error && err.stack) return err.stack;
  return null;
}

export async function logError(err: unknown, source: ErrorSource, extra?: { componentStack?: string }) {
  try {
    const message = messageOf(err).slice(0, 2000);
    if (!message || isNoise(message)) return;
    if (sessionCount >= SESSION_CAP) return;

    const signature = `${source}::${message}`;
    const now = Date.now();
    const last = recentSignatures.get(signature);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recentSignatures.set(signature, now);
    sessionCount++;

    let stack = stackOf(err);
    if (extra?.componentStack) stack = `${stack || ''}\n--- Component stack ---${extra.componentStack}`;

    // Read user from local session (no network round-trip).
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user?.id ?? null;
      userEmail = data.session?.user?.email ?? null;
    } catch { /* session unavailable — log anonymously */ }

    await supabase.from('error_logs').insert({
      message,
      stack: stack ? stack.slice(0, 8000) : null,
      source,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      user_id: userId,
      user_email: userEmail,
    });
  } catch {
    // Logging must never throw or cascade — swallow silently.
  }
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    logError(event.error ?? event.message, 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason ?? 'Unhandled promise rejection', 'promise');
  });
}
