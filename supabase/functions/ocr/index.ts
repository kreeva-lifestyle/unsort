import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retired (2026-10-21). This was an OCR.space proxy that nothing in the app
// calls any more; it ran without sign-in and carried a fallback API key in
// its source. It now holds no key, needs a signed-in user (verify_jwt) and
// only says it is retired. To bring OCR back, write a new function that
// reads its key from a project secret and checks the caller's role.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  return new Response(JSON.stringify({ error: 'This OCR service has been retired.' }), { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
