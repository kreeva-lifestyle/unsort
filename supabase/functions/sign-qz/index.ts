// sign-qz Edge Function — signs QZ Tray challenge strings with the private key
// matching the certificate pinned in src/lib/qzPrint.ts, so QZ Tray trusts our
// print requests without per-machine prompts.
//
// Deployed with verify_jwt: true — only authenticated app users can request
// signatures. The private key lives ONLY in the QZ_PRIVATE_KEY function secret.
//
// Source of truth: this file mirrors the deployed function (v2). If you change
// it, redeploy via the Supabase MCP deploy_edge_function (keep verify_jwt on).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
