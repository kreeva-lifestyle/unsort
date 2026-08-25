// sheetPdf.ts — parse a Shadowfax-style delivery document (the pre-delivery
// "Delivery Sheet" AND the post-delivery "Delivery Report" share one
// skeleton: <h1>, info <p>s, then <h3> + <table> blocks, with red
// class="warning" lines) and rebuild it as a PDF that mirrors the original:
// bordered tables with a shaded header row, red warning lines, and —
// crucially — everything in DOCUMENT ORDER, so the report's "delivered" /
// "undelivered" section markers stay between the right tables.
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ').trim();

export type SheetItem =
  | { t: 'title' | 'heading' | 'text' | 'warn'; text: string }
  | { t: 'table'; rows: string[][] };
export interface Sheet { items: SheetItem[] }

export function parseSheet(html: string): Sheet | null {
  const body = html.split(/<body[^>]*>/i)[1] || html;
  const items: SheetItem[] = [];
  const re = /<(h1|h3|p|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    if (tag === 'table') {
      const rows: string[][] = [];
      for (const tr of m[3].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => stripTags(c[1]));
        if (cells.length) rows.push(cells);
      }
      if (rows.length) items.push({ t: 'table', rows });
    } else {
      const text = stripTags(m[3]);
      if (!text || text.length > 300) continue;
      if (tag === 'h1') items.push({ t: 'title', text });
      else if (tag === 'h3') items.push({ t: 'heading', text });
      else items.push({ t: /warning|color\s*:\s*red/i.test(m[2]) ? 'warn' : 'text', text });
    }
  }
  return items.some(i => i.t === 'table') ? { items } : null;
}

// Helvetica is WinAnsi-only — strip anything outside printable ASCII so a
// stray ₹ or emoji can't crash the PDF build.
const pdfSafe = (s: string) => s.replace(/[^\x20-\x7e]/g, '').trim();

export async function buildPdf(sheet: Sheet, courier: string, dateLabel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [font, boldF] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)]);
  const W = 595, H = 842, M = 40, tw = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const black = rgb(0.07, 0.07, 0.07), gray = rgb(0.35, 0.35, 0.35), red = rgb(0.8, 0.1, 0.1), grid = rgb(0.7, 0.7, 0.7);
  const ensure = (need: number) => { if (y - need < M) { page = doc.addPage([W, H]); y = H - M; } };
  const write = (txt: string, f = font, size = 10, color = black, gap = 6) => {
    // Word-wrap long lines (the warning notes run ~140 chars).
    let line = '';
    const flush = () => {
      if (!line) return;
      ensure(size + 2);
      page.drawText(line, { x: M, y: y - size, size, font: f, color });
      y -= size + gap;
      line = '';
    };
    for (const w of pdfSafe(txt).split(' ')) {
      if (line && f.widthOfTextAtSize(`${line} ${w}`, size) > tw) flush();
      line = line ? `${line} ${w}` : w;
    }
    flush();
  };
  const table = (rows: string[][]) => {
    const cols = Math.max(1, ...rows.map(r => r.length));
    const colW = tw / cols, rh = 18, size = 9;
    rows.forEach((r, ri) => {
      ensure(rh + 1);
      if (ri === 0) page.drawRectangle({ x: M, y: y - rh, width: tw, height: rh, color: rgb(0.94, 0.94, 0.94) });
      page.drawLine({ start: { x: M, y }, end: { x: M + tw, y }, thickness: 0.5, color: grid });
      page.drawLine({ start: { x: M, y: y - rh }, end: { x: M + tw, y: y - rh }, thickness: 0.5, color: grid });
      for (let ci = 0; ci <= cols; ci++) {
        page.drawLine({ start: { x: M + ci * colW, y }, end: { x: M + ci * colW, y: y - rh }, thickness: 0.5, color: grid });
      }
      r.forEach((cell, ci) => {
        page.drawText(pdfSafe(cell).slice(0, Math.floor((colW - 8) / (size * 0.5))), {
          x: M + ci * colW + 4, y: y - rh + 5, size, font: ri === 0 ? boldF : font, color: black,
        });
      });
      y -= rh;
    });
    y -= 10;
  };
  // Title block first (whatever the document calls itself), courier + date under it.
  const title = sheet.items.find(i => i.t === 'title') as { text: string } | undefined;
  write(title?.text || 'Delivery Sheet', boldF, 16, black, 4);
  write(`${courier} - ${dateLabel}`, font, 10, gray, 10);
  for (const it of sheet.items) {
    if (it.t === 'title') continue;
    else if (it.t === 'heading') { y -= 4; write(it.text, boldF, 12, black, 6); }
    else if (it.t === 'warn') { y -= 2; write(it.text, boldF, 10, red, 8); }
    else if (it.t === 'text') write(it.text, font, 9, gray, 4);
    else table(it.rows);
  }
  return await doc.save();
}
