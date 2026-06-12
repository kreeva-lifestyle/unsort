// admin-users Edge Function — bans/unbans the Supabase AUTH account when an
// admin toggles a user's Active switch. Flipping profiles.is_active alone
// left the auth account alive: a revoked user could keep using an existing
// session token or password-reset their way back in. Banning the auth user
// blocks token refresh, sign-in, and password reset entirely.
//
// Deployed with verify_jwt: true. The caller is re-checked here: only an
// ACTIVE admin may call, and admins cannot deactivate themselves. The
// service-role key never leaves this function.
//
// Source of truth: deploy via Supabase MCP deploy_edge_function (verify_jwt on).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, target_user_id } = await req.json();
    if ((action !== 'deactivate' && action !== 'reactivate') || typeof target_user_id !== 'string' || !target_user_id) {
      return json({ error: 'Expected { action: "deactivate" | "reactivate", target_user_id }' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Identify the caller from their own JWT (RLS applies on this client)
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);

    const { data: prof } = await caller.from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (!prof || prof.role !== 'admin' || prof.is_active === false) {
      return json({ error: 'Only active admins can change user access' }, 403);
    }
    if (action === 'deactivate' && target_user_id === user.id) {
      return json({ error: 'You cannot deactivate your own account' }, 400);
    }

    const admin = createClient(url, serviceKey);
    // ~100 years; 'none' lifts the ban
    const { error } = await admin.auth.admin.updateUserById(target_user_id, {
      ban_duration: action === 'deactivate' ? '876600h' : 'none',
    });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
});
