// CORS, JSON replies and the one error type every step throws: HttpError
// carries an HTTP status and a plain sentence that the app shows as-is.

export class HttpError extends Error {
  status: number; // a plain field (not a parameter property), so node --test can strip the types
  /** Extra fields for the JSON reply (e.g. the look-alikes of a 409). */
  extra?: Record<string, unknown>;
  /** What the AI call behind this failure cost, when the model had answered (ai.ts): logged with the failure, so it is counted. */
  usd?: number;
  constructor(status: number, message: string, extra?: Record<string, unknown>) { super(message); this.status = status; this.extra = extra; }
}

/** The AI cost a failure carries (0 when none). */
export const usdOf = (e: unknown) => (e instanceof HttpError && typeof e.usd === 'number' && e.usd > 0 ? e.usd : 0);

/** A short, readable message for anything thrown (never a stack trace). */
export function plain(e: unknown): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'An outside service took too long to answer.';
  const m = e instanceof Error ? e.message : String(e ?? '');
  return (m || 'Something went wrong on the Playbook server.').slice(0, 300);
}

const ALLOWED_ORIGINS = [
  'https://dailyoffice.aryadesigns.co.in',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
    Vary: 'Origin',
  };
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'content-type': 'application/json' } });

export const fail = (req: Request, status: number, error: string, extra?: Record<string, unknown>) => json(req, { ...(extra || {}), ok: false, error }, status);

/** fetch with a time limit (ms); a timeout surfaces as a plain sentence via plain(). */
export function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1000, ms)) });
}
