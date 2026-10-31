// sign-qz Edge Function — signs QZ Tray challenge strings with the private key
// matching the certificate pinned in src/lib/qzPrint.ts, so QZ Tray trusts our
// print requests without per-machine prompts.
//
// Deployed with verify_jwt: true — only authenticated app users can request
// signatures. The private key lives ONLY in the QZ_PRIVATE_KEY function secret.
//
// v4 (security audit 2026-10-31): verify_jwt alone also admits the PUBLIC anon
// key (it is a validly signed project JWT), which made this an open signing
// oracle. The caller is now resolved and must be an active admin/manager/
// operator before anything is signed.
//
// Source of truth: this file mirrors the deployed function (v4). If you change
// it, redeploy via the Supabase MCP deploy_edge_function (keep verify_jwt on).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// The bearer must be a real user session (not the anon key) whose profile is
// an active admin, manager or operator.
async function isActiveStaff(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_SVC } });
  if (!u.ok) return false;
  const user = await u.json().catch(() => null);
  if (!user?.id) return false;
  const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,is_active`, { headers: { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}` } });
  const prof = (await p.json().catch(() => []))?.[0];
  return !!prof && prof.is_active !== false && ['admin', 'manager', 'operator'].includes(prof.role);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!(await isActiveStaff(req))) {
      return new Response(JSON.stringify({ error: 'Sign in to DailyOffice first' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { toSign } = await req.json();
    if (!toSign || typeof toSign !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing toSign field' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pemKey = Deno.env.get('QZ_PRIVATE_KEY');
    if (!pemKey) {
      return new Response(JSON.stringify({ error: 'QZ_PRIVATE_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pemBody = pemKey
      .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/, '')
      .replace(/-----END (?:RSA )?PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
      false,
      ['sign']
    );

    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(toSign)
    );

    const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return new Response(JSON.stringify({ signature: base64Sig }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('sign-qz error:', (err as Error).message);
    return new Response(JSON.stringify({ error: 'Signing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
