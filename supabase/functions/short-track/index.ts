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

function isSafeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    return true;
  } catch {
    return false;
  }
}

async function visitorHash(ip: string, ua: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const raw = `${ip}|${ua}|${day}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sliding-window rate limit, best-effort within a single isolate.
// Cold starts reset the map; that's fine for click-farm deterrence.
const RATE_LIMIT_PER_MINUTE = 60;
const rateBuckets = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - 60_000;
  const arr = (rateBuckets.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= RATE_LIMIT_PER_MINUTE) return true;
  arr.push(now);
  rateBuckets.set(ip, arr);
  // Opportunistic GC: every ~1000 hits, drop stale buckets
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets) {
      if (v.length === 0 || v[v.length - 1] < cutoff) rateBuckets.delete(k);
    }
  }
  return false;
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

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

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ ok: false, error: 'Rate limited' }), {
      status: 429,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const url = new URL(req.url);
  const ua = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  const country = req.headers.get('x-country') || req.headers.get('cf-ipcountry') || '';
  const city = req.headers.get('x-city') || req.headers.get('cf-ipcity') || '';
  const { device, browser, os } = parseUA(ua);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const vHash = await visitorHash(ip, ua);

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
      p_visitor_hash: vHash,
    });

    if (!longUrl || !isSafeUrl(longUrl)) {
      return new Response('<!doctype html><html><head><meta charset="utf-8"><title>Link not found</title><meta name="robots" content="noindex"><style>body{font-family:-apple-system,sans-serif;background:#060810;color:#E2E8F0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px}h1{font-size:20px;margin:0 0 8px}p{font-size:13px;color:#8896B0;margin:0}</style></head><body><div><h1>Link not found</h1><p>This link does not exist or has been removed.</p></div></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: longUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
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
          p_visitor_hash: vHash,
        });
        if (!longUrl || !isSafeUrl(longUrl)) return fail(404, 'Link not found', req);
        return json({ ok: true, longUrl }, req);
      }
      return fail(400, 'Unknown action', req);
    } catch {
      return fail(400, 'Invalid JSON body', req);
    }
  }

  return fail(405, 'Method not allowed', req);
});
