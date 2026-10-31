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
// `create` (v4): public sign-up is closed (handle_new_user refuses accounts that
// were not made here), so inviting a teammate now happens server-side: the
// service role creates the auth user already confirmed and stamps
// app_metadata.created_by_admin, which is the marker handle_new_user accepts,
// then sets the chosen role. Nobody but an active admin reaches this.
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
    const body = await req.json();
    const { action, target_user_id, new_password } = body;
    const isCreate = action === 'create';
    if (!isCreate && (!['deactivate', 'reactivate', 'reset_password'].includes(action) || typeof target_user_id !== 'string' || !target_user_id)) {
      return json({ error: 'Expected { action: "create" | "deactivate" | "reactivate" | "reset_password", ... }' }, 400);
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

    if (isCreate) {
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.full_name || '').trim().slice(0, 120);
      const role = String(body.role || 'viewer');
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      if (!['admin', 'manager', 'operator', 'viewer'].includes(role)) return json({ error: 'Unknown role' }, 400);
      const { data: made, error: mkErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { created_by_admin: user.id },
      });
      if (mkErr || !made.user) return json({ error: mkErr?.message || 'Could not create the user' }, 400);
      // handle_new_user already inserted the profile row (role viewer). Set the
      // chosen role as the calling admin (not the service role): the
      // check_profile_admin_fields trigger only lets an admin's auth.uid() change role.
      const { error: roleErr } = await caller.from('profiles').update(fullName ? { role, full_name: fullName } : { role }).eq('id', made.user.id);
      if (roleErr) return json({ ok: true, user_id: made.user.id, warning: 'User created, but the role could not be set — change it in the list' });
      return json({ ok: true, user_id: made.user.id });
    }

    if (action === 'reset_password') {
      if (typeof new_password !== 'string' || new_password.length < 8) {
        return json({ error: 'Password must be at least 8 characters' }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(target_user_id, { password: new_password });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

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
