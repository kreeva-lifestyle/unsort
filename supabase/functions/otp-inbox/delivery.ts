// delivery.ts — when a forwarded courier SMS carries a delivery-sheet link
// (e.g. Shadowfax's lnk.sdfx.in delivery-code messages), fetch the sheet
// server-side, rebuild it as a clean PDF and file it into the Dropbox folder
// chosen in OTP Inbox settings (app_settings.otp_delivery_sheet_folder).
// Naming: "DD-MM-YYYY - {Courier}.pdf", then " (2)", " (3)" the same day.
// Courier detection uses the names already saved in packtime_couriers —
// nothing hardcoded here. Every outcome is written back onto the otp_inbox
// row (sheet_status / sheet_file) so staff see it live; failures never block
// the OTP itself, which is already stored when this runs.
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

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

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ').trim();

export interface Sheet { title: string; meta: string[]; groups: { heading: string; rows: string[][] }[] }

// The delivery sheet is simple structured HTML: an <h1>, a few info <p>s,
// then repeated <h3> + <table> blocks. Parse generically so minor layout
// changes survive; return null when nothing table-like is found.
export function parseSheet(html: string): Sheet | null {
  const title = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1] || '');
  const meta: string[] = [];
  for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1]);
    if (t && t.length <= 160 && meta.length < 8) meta.push(t);
  }
  const groups: Sheet['groups'] = [];
  const chunks = html.split(/<h3[^>]*>/i);
  for (let i = 1; i < chunks.length; i++) {
    const heading = stripTags(chunks[i].split(/<\/h3>/i)[0] || '');
    const rows: string[][] = [];
    for (const tr of chunks[i].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => stripTags(c[1]));
      if (cells.length) rows.push(cells);
    }
    if (heading || rows.length) groups.push({ heading, rows });
  }
  return groups.length ? { title: title || 'Delivery Sheet', meta, groups } : null;
}

// Helvetica is WinAnsi-only — strip anything outside printable ASCII so a
// stray ₹ or emoji can't crash the PDF build.
const pdfSafe = (s: string) => s.replace(/[^\x20-\x7e]/g, '').trim();

export async function buildPdf(sheet: Sheet, courier: string, dateLabel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [font, bold] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const W = 595, H = 842, M = 40;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const gray = rgb(0.35, 0.35, 0.35);
  const write = (txt: string, f = font, size = 10, color = rgb(0, 0, 0), gap = 6) => {
    // Word-wrap long lines (the sheet's warning note runs ~140 chars) instead
    // of truncating them.
    const words = pdfSafe(txt).split(' ');
    let line = '';
    const flush = () => {
      if (!line) return;
      if (y < M + size) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(line, { x: M, y: y - size, size, font: f, color });
      y -= size + gap;
      line = '';
    };
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > W - 2 * M) flush();
      line = line ? `${line} ${w}` : w;
    }
    flush();
  };
  write(sheet.title, bold, 16, rgb(0, 0, 0), 4);
  write(`${courier} - ${dateLabel}`, font, 10, gray, 10);
  for (const m of sheet.meta) write(m, font, 9, gray, 4);
  for (const g of sheet.groups) {
    y -= 8;
    write(g.heading, bold, 12, rgb(0, 0, 0), 6);
    const cols = Math.max(1, ...g.rows.map(r => r.length));
    const colW = (W - 2 * M) / cols;
    g.rows.forEach((r, ri) => {
      const size = 9;
      if (y < M + size) { page = doc.addPage([W, H]); y = H - M; }
      r.forEach((cell, ci) => {
        page.drawText(pdfSafe(cell).slice(0, Math.floor(colW / (size * 0.5))), {
          x: M + ci * colW, y: y - size, size, font: ri === 0 ? bold : font, color: ri === 0 ? gray : rgb(0, 0, 0),
        });
      });
      y -= size + 5;
    });
  }
  return await doc.save();
}

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
    // IST date for the file name — the phone receiving the SMS lives in IST.
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const dateStr = `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`;
    const base = `${dateStr} - ${courier}`;
    const dest = folder.startsWith('/') ? folder : `/${folder}`;
    let saved: string;
    if (/pdf/i.test(ctype)) {
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
