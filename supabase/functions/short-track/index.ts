// short-track Edge Function — URL redirect + click tracking for Short N Track.
//
// Client contract:
//   GET  /:shortCode          -> 302 redirect to long_url (logs click)
//   POST { action: 'resolve', shortCode } -> { ok, longUrl } (used by preview)
//
// Click metadata parsed from request headers (User-Agent, Referer, CF geo headers).

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = [
  'https://dailyoffice.aryadesigns.co.in',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const json = (body: any, req: Request, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });
const fail = (status: number, error: string, req: Request) => json({ ok: false, error }, req, status);

function parseUA(ua: string): { device: string; browser: string; os: string } {
  const device = /mobile|android|iphone|ipad/i.test(ua)
    ? (/ipad|tablet/i.test(ua) ? 'tablet' : 'mobile')
    : 'desktop';

  let browser = 'Unknown';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome\//i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';

  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { device, browser, os };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  const url = new URL(req.url);
  const ua = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  const country = req.headers.get('x-country') || req.headers.get('cf-ipcountry') || '';
  const city = req.headers.get('x-city') || req.headers.get('cf-ipcity') || '';
  const { device, browser, os } = parseUA(ua);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // GET /:shortCode — redirect
  if (req.method === 'GET') {
    const parts = url.pathname.split('/').filter(Boolean);
    const shortCode = parts[parts.length - 1];
    if (!shortCode || shortCode === 'short-track') {
      return fail(400, 'Missing short code', req);
    }

    const { data: longUrl } = await sb.rpc('record_link_click', {
      p_short_code: shortCode,
      p_user_agent: ua.slice(0, 500),
      p_device_type: device,
      p_browser: browser,
      p_os: os,
      p_referrer: referer.slice(0, 500),
      p_country: country,
      p_city: city,
    });

    if (!longUrl) {
      return new Response('<html><body><h1>Link not found</h1><p>This short link does not exist or has been removed.</p></body></html>', {
        status: 404,
        headers: { ...corsHeaders(req), 'Content-Type': 'text/html' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders(req), Location: longUrl },
    });
  }

  // POST — resolve without redirect (for preview/API)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      if (body.action === 'resolve') {
        const { data: longUrl } = await sb.rpc('record_link_click', {
          p_short_code: body.shortCode,
          p_user_agent: ua.slice(0, 500),
          p_device_type: device,
          p_browser: browser,
          p_os: os,
          p_referrer: referer.slice(0, 500),
          p_country: country,
          p_city: city,
        });
        if (!longUrl) return fail(404, 'Link not found', req);
        return json({ ok: true, longUrl }, req);
      }
      return fail(400, 'Unknown action', req);
    } catch {
      return fail(400, 'Invalid JSON body', req);
    }
  }

  return fail(405, 'Method not allowed', req);
});
