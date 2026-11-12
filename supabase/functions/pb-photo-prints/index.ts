// pb-photo-prints — the prints of a small batch of waiting product photos per call
// ("already added?" step 3: the same photo saved again; owner, 2026-11-12).
// Deployed with verify_jwt = false: it does its own auth and takes only the
// automation's shared secret (x-sync-secret = pb_worker_secret), sent by
// pg_cron through trigger_pb_photo_prints() while photos are waiting. Staff
// have nothing to press here: the result shows on a product as "Could this be
// already added? · Same photo" (pb_dup_matches).
//
//   POST {}  →  { ok, done, skipped, paired, read_ms, notes[], stopped? }   (all 0 when nothing is waiting)
//
// Its own function, apart from pb-products, on purpose: reading a photo is
// the one CPU-heavy thing Playbook does on the server, and a call that runs
// out of CPU here costs one photo (tried again later), never a listing that
// was being written or published.
// No AI, no paid service and no library: the photo's block averages are read
// straight from the JPEG (jpegDc.ts) and turned into a print (print.ts).
import { whoIs } from '../pb-products/auth.ts';
import { HttpError, corsHeaders, fail, json, plain } from '../pb-products/http.ts';
import { liveDeps } from './live.ts';
import { runBatch } from './work.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return fail(req, 405, 'Only POST requests are accepted.');
  try {
    const caller = await whoIs(req);
    if (!caller) return fail(req, 401, 'Sign in to DailyOffice again — Playbook is for active staff only.');
    if (caller.kind !== 'secret') return fail(req, 403, 'Only the automation can use this.');
    return json(req, { ok: true, ...(await runBatch(liveDeps())) });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error('pb-photo-prints:', e instanceof Error ? e.stack || e.message : e);
    return fail(req, status, e instanceof HttpError || e instanceof DOMException ? plain(e) : 'Something went wrong on the Playbook server.');
  }
});
