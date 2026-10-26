// The packtime edge function from the phone: auth headers from the live
// session, one POST with a timeout and a single retry on a network blip,
// and a parsed body with real error text for the UI (moved out of
// PackTime.tsx). The function verifies the CALLER — the Bearer token must be
// a signed-in active profile; the anon key alone is rejected.
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';

export const EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/packtime';

export const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  };
};

export async function callEdge(body: unknown, timeoutMs = 20000): Promise<any> {
  let lastDetails = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(EDGE_FN, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
      clearTimeout(t);
      const text = await resp.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
      if (resp.ok) return parsed ?? { ok: false, error: 'Empty response from server.' };
      const gatewayMsg = parsed?.error || parsed?.message || parsed?.msg || text.slice(0, 180);
      lastDetails = `HTTP ${resp.status}${gatewayMsg ? ` — ${gatewayMsg}` : ''}`;
      return { ok: false, error: resp.status >= 500 ? 'Server error. Try again in a moment.' : 'Request rejected by server.', details: lastDetails };
    } catch (err) {
      clearTimeout(t);
      const isTimeout = (err as { name?: string })?.name === 'AbortError';
      lastDetails = isTimeout ? `timeout after ${timeoutMs}ms` : ((err as Error)?.message || 'network error');
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      return { ok: false, error: isTimeout ? 'Server timed out. Try again.' : 'Cannot connect to server. Try again.', details: lastDetails };
    }
  }
  return { ok: false, error: 'Cannot connect to server. Try again.', details: lastDetails };
}
