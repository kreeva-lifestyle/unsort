// delivery.ts — when a forwarded courier SMS carries a delivery-sheet link
// (e.g. Shadowfax's lnk.sdfx.in delivery-code messages), fetch the sheet
// server-side, rebuild it as a clean PDF and file it into the Dropbox folder
// chosen in OTP Inbox settings (app_settings.otp_delivery_sheet_folder).
// Naming: "DD-MM-YYYY - {Courier}.pdf", then " (2)", " (3)" the same day.
// Courier detection uses the names already saved in packtime_couriers —
// nothing hardcoded here. Every outcome is written back onto the otp_inbox
// row (sheet_status / sheet_file) so staff see it live; failures never block
// the OTP itself, which is already stored when this runs.
import { parseSheet, buildPdf } from './sheetPdf.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const svcHeaders = { apikey: SB_SVC, authorization: `Bearer ${SB_SVC}`, 'content-type': 'application/json' };

async function getSecret(key: string): Promise<string> {
  const r = await fetch(`${SB_URL}/rest/v1/app_secrets?key=eq.${key}&select=value`, { headers: svcHeaders });
  return (await r.json().catch(() => []))?.[0]?.value ?? '';
}

async function getSetting(key: string): Promise<string> {
  const r = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.${key}&select=value`, { headers: svcHeaders });
  const v = (await r.json().catch(() => []))?.[0]?.value;
  return typeof v === 'string' ? v : '';
}

// Same refresh-token-keyed cache as odette-export: a Dropbox reconnect
// (new refresh token) invalidates the cached access token on the next call.
let dbxCache: { token: string; expiresAt: number; rt: string } | null = null;
async function getDropboxToken(): Promise<string> {
  const rt = await getSecret('dropbox_refresh_token');
  if (!rt) throw new Error('Dropbox is not connected');
  if (dbxCache && dbxCache.rt === rt && dbxCache.expiresAt > Date.now() + 60_000) return dbxCache.token;
  const [ck, cs] = await Promise.all([getSecret('dropbox_app_key'), getSecret('dropbox_app_secret')]);
  if (!ck || !cs) throw new Error('Dropbox app credentials missing');
  const r = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: ck, client_secret: cs }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Dropbox token ${r.status}`);
  dbxCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 14000) * 1000, rt };
  return dbxCache.token;
}

const asciiArg = (o: unknown) =>
  JSON.stringify(o).replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// "Shadow Fax" in the DB matches "Shadowfax" in the SMS: compare with
// spaces/punctuation removed, case-insensitively. Returns the DB name —
// the canonical spelling the owner keeps in PackStation settings.
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
export function detectCourier(text: string, courierNames: string[]): string {
  const t = compact(text);
  let best = '';
  for (const n of courierNames) {
    const c = compact(n);
    if (c && t.includes(c) && c.length > compact(best).length) best = n;
  }
  return best;
}

// Trailing sentence punctuation is part of the SMS, not the URL — the real
// Shadowfax message ends "…ICCC2. Share code…", and fetching with the dot 404s.
export const findLink = (text: string): string =>
  ((text.match(/https?:\/\/[^\s"'<>]+/) || [''])[0]).replace(/[.,;:!?)\]]+$/, '');

async function uploadToDropbox(folder: string, baseName: string, ext: string, bytes: Uint8Array): Promise<string> {
  const token = await getDropboxToken();
  // Same-day repeats become "(2)", "(3)"… — list what's already there first
  // (folder may not exist yet: Dropbox creates it on upload, list just 409s).
  const ls = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ path: folder, limit: 2000 }),
  });
  const lsData = ls.ok ? await ls.json().catch(() => ({ entries: [] })) : { entries: [] };
  const existing = new Set((lsData.entries || []).map((e: { name: string }) => String(e.name).toLowerCase()));
  let name = `${baseName}${ext}`;
  if (existing.has(name.toLowerCase())) { let n = 2; while (existing.has(`${baseName} (${n})${ext}`.toLowerCase())) n++; name = `${baseName} (${n})${ext}`; }
  const up = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiArg({ path: `${folder}/${name}`, mode: 'add', autorename: true, mute: true }) },
    body: new Blob([bytes], { type: 'application/octet-stream' }),
  });
  if (!up.ok) throw new Error(`Dropbox upload failed (${up.status})`);
  const ud = await up.json().catch(() => ({} as { name?: string }));
  return ud?.name || name;
}

// The whole pipeline for one stored OTP row. Never throws — every outcome,
// success or failure, is PATCHed onto the row for the UI to show.
export async function processDeliverySheet(rowId: string, text: string): Promise<void> {
  const report = (patch: { sheet_status?: string; sheet_file?: string }) =>
    fetch(`${SB_URL}/rest/v1/otp_inbox?id=eq.${rowId}`, { method: 'PATCH', headers: svcHeaders, body: JSON.stringify(patch) }).catch(() => {});
  try {
    const link = findLink(text);
    if (!link) return;                                   // a plain OTP — nothing to file
    const cr = await fetch(`${SB_URL}/rest/v1/packtime_couriers?is_active=eq.true&select=name`, { headers: svcHeaders });
    const couriers = ((await cr.json().catch(() => [])) as { name: string }[]).map(c => c.name);
    const courier = detectCourier(text, couriers);
    if (!courier) return;                                // link but no known courier — leave it alone
    const folder = (await getSetting('otp_delivery_sheet_folder')).trim().replace(/\/+$/, '');
    if (!folder) { await report({ sheet_status: 'Delivery sheet found — set the Dropbox folder in OTP Inbox settings to save it automatically' }); return; }
    const res = await fetch(link, { redirect: 'follow' });
    if (!res.ok) { await report({ sheet_status: `Could not open the ${courier} link (${res.status})` }); return; }
    const ctype = res.headers.get('content-type') || '';
    const raw = new Uint8Array(await res.arrayBuffer());
    if (raw.byteLength > 4_000_000) { await report({ sheet_status: 'Sheet too large to save' }); return; }
    // Trust the bytes, not the server's label: Delhivery serves a real PDF
    // but without a pdf content-type, which made this save as ".html".
    const magicPdf = raw.length > 4 && raw[0] === 0x25 && raw[1] === 0x50 && raw[2] === 0x44 && raw[3] === 0x46 && raw[4] === 0x2d; // %PDF-
    // IST date for the file name — the phone receiving the SMS lives in IST.
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const dateStr = `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`;
    const base = `${dateStr} - ${courier}`;
    const dest = folder.startsWith('/') ? folder : `/${folder}`;
    let saved: string;
    if (magicPdf || /pdf/i.test(ctype)) {
      saved = await uploadToDropbox(dest, base, '.pdf', raw);
    } else {
      const html = new TextDecoder().decode(raw);
      const sheet = parseSheet(html);
      if (sheet) saved = await uploadToDropbox(dest, base, '.pdf', await buildPdf(sheet, courier, dateStr));
      // Unrecognized layout: keep the original page rather than losing it.
      else saved = await uploadToDropbox(dest, base, '.html', raw);
    }
    await report({ sheet_file: saved, sheet_status: null as unknown as string });
  } catch (e) {
    await report({ sheet_status: `Delivery sheet not saved — ${String((e as Error)?.message || e).slice(0, 140)}` });
  }
}
