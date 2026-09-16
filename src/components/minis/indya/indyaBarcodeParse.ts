// Reads Indya's barcode label PDF into one record per label. A page holds
// any number of labels (the sample has 4 in a 2×2 grid); each label is a
// barcode Form XObject (the bars are filled `re` rectangles, the SKU is the
// text inside the form) with the product text around it. Nothing is
// interpreted: every text run is kept with its size and weight, grouped into
// lines by position, and only sorted into left / right / footer blocks
// relative to the barcode so the reflow onto the 1.97 × 2.97 in label keeps
// the original reading order.
import { PdfDoc, PdfDict, PdfVal, isName, isOp, isRef, isStr, parseValue, latin1, toBytes } from './pdfObjects';

export interface Run { text: string; size: number; bold: boolean }
export interface Line { runs: Run[] }
/** Bar rectangles in their own units (SVG coords: y grows downward), so the
 *  label can draw them at any size while keeping every bar's exact ratio. */
export interface Bars { w: number; h: number; rects: number[][] }
export interface IndyaLabel { sku: string; bars: Bars | null; left: Line[]; right: Line[]; footer: Line[]; page: number }

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const pt = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const six = (a: PdfVal[]): M => [0, 1, 2, 3, 4, 5].map(i => (typeof a[i] === 'number' ? a[i] : 0)) as M;

// Helvetica AFM widths for chars 32–126 (Indya's fonts are Helvetica and
// Helvetica-Bold); only used to estimate where a run ends on the line.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const width = (s: string, size: number) => [...s].reduce((n, c) => n + (W[c.charCodeAt(0) - 32] ?? 556), 0) / 1000 * size;
const win = new TextDecoder('windows-1252');

interface Text { x: number; y: number; w: number; size: number; bold: boolean; text: string }
interface Placed { x0: number; y0: number; x1: number; y1: number; bars: Bars | null; sku: string }
interface Sink { texts: Text[]; rects: number[][]; placed: Placed[] }

const mkBars = (rects: number[][]): Bars | null => {
  const rs = rects.filter(r => r[2] > 0 && r[3] > 0);
  if (!rs.length) return null;
  const L = Math.min(...rs.map(r => r[0])), R = Math.max(...rs.map(r => r[0] + r[2]));
  const B = Math.min(...rs.map(r => r[1])), T = Math.max(...rs.map(r => r[1] + r[3]));
  return { w: +(R - L).toFixed(3), h: +(T - B).toFixed(3), rects: rs.map(([x, y, w, h]) => [x - L, T - (y + h), w, h].map(v => +v.toFixed(3))) };
};

/** Runs one content stream (page or form) in device space, filling `sink`. */
async function run(doc: PdfDoc, content: Uint8Array, res: PdfDict | null, ctm0: M, sink: Sink, depth: number): Promise<void> {
  const s = latin1(content); let p = 0;
  const stack: M[] = []; let ctm = ctm0, tm: M = I, tlm: M = I;
  let size = 0, bold = false, lead = 0, tc = 0, tw = 0, th = 1; let pend: number[][] = [];
  const args: PdfVal[] = [];
  const fonts = doc.dict(res?.get('Font') ?? null), xobjs = doc.dict(res?.get('XObject') ?? null);
  const n = (i: number) => { const v = args[i]; return typeof v === 'number' ? v : 0; };
  const nl = (tx: number, ty: number) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  const show = (str: string) => {
    const text = win.decode(toBytes(str)); if (!text) return;
    const m = mul(tm, ctm), sc = Math.hypot(m[0], m[1]), [x, y] = pt(m, 0, 0);
    const adv = (width(text, size) + tc * text.length + tw * (text.split(' ').length - 1)) * th;
    sink.texts.push({ x, y, w: adv * sc, size: size * sc, bold, text });
    tm = mul([1, 0, 0, 1, adv, 0], tm);
  };
  const form = async (name: PdfVal) => {
    const ref = xobjs && isName(name) ? xobjs.get(name.n) ?? null : null;
    const xd = doc.dict(ref);
    if (!isRef(ref) || !xd || doc.name(xd.get('Subtype') ?? null) !== 'Form' || depth > 4) return;
    const bytes = await doc.stream(ref.r); if (!bytes) return;
    const mtx = doc.nums(xd.get('Matrix') ?? null), dev = mul(mtx?.length === 6 ? (mtx as M) : I, ctm);
    const sub: Sink = { texts: [], rects: [], placed: [] };
    await run(doc, bytes, doc.dict(xd.get('Resources') ?? null) ?? res, dev, sub, depth + 1);
    const bars = mkBars(sub.rects);
    if (!bars) { sink.texts.push(...sub.texts); sink.placed.push(...sub.placed); return; } // a form that is not a barcode: keep its text
    const bb = doc.nums(xd.get('BBox') ?? null) ?? [0, 0, 0, 0];
    const cs = [pt(dev, bb[0], bb[1]), pt(dev, bb[2], bb[1]), pt(dev, bb[0], bb[3]), pt(dev, bb[2], bb[3])];
    sink.placed.push({ x0: Math.min(...cs.map(c => c[0])), y0: Math.min(...cs.map(c => c[1])), x1: Math.max(...cs.map(c => c[0])), y1: Math.max(...cs.map(c => c[1])), bars, sku: sub.texts.map(t => t.text.trim()).filter(Boolean).join(' ') });
  };
  while (p < s.length) {
    const [v, q] = parseValue(s, p); p = q;
    if (!isOp(v)) { args.push(v); if (args.length > 64) args.shift(); continue; }
    switch (v.op) {
      case 'EOF': p = s.length; break;
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() ?? ctm; break;
      case 'cm': ctm = mul(six(args), ctm); break;
      case 'BT': tm = tlm = I; break;
      case 'Tf': { size = n(1); const fd = fonts && isName(args[0]) ? doc.dict(fonts.get(args[0].n) ?? null) : null; bold = /bold|black|heavy/i.test(fd ? doc.name(fd.get('BaseFont') ?? null) ?? '' : ''); break; }
      case 'Td': nl(n(0), n(1)); break;
      case 'TD': lead = -n(1); nl(n(0), n(1)); break;
      case 'Tm': tm = tlm = six(args); break;
      case 'T*': nl(0, -lead); break;
      case 'TL': lead = n(0); break;
      case 'Tc': tc = n(0); break;
      case 'Tw': tw = n(0); break;
      case 'Tz': th = n(0) / 100; break;
      case 'Tj': if (isStr(args[0])) show(args[0].str); break;
      case "'": nl(0, -lead); if (isStr(args[0])) show(args[0].str); break;
      case '"': tw = n(0); tc = n(1); nl(0, -lead); if (isStr(args[2])) show(args[2].str); break;
      case 'TJ': for (const el of Array.isArray(args[0]) ? args[0] : []) { if (isStr(el)) show(el.str); else if (typeof el === 'number') tm = mul([1, 0, 0, 1, -el / 1000 * size * th, 0], tm); } break;
      case 're': pend.push([n(0), n(1), n(2), n(3)]); break;
      case 'f': case 'F': case 'f*': case 'B': case 'B*': case 'b': case 'b*':
        for (const [x, y, w, h] of pend) { const a = pt(ctm, x, y), b = pt(ctm, x + w, y + h); sink.rects.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]); }
        pend = []; break;
      case 'S': case 's': case 'n': pend = []; break;
      case 'Do': await form(args[0]); break;
    }
    args.length = 0;
  }
}

const runsOf = (g: Text[]): Run[] => {
  const out: (Run & { end: number })[] = [];
  for (const t of g) {
    const text = t.text.trim(); if (!text) continue;
    const prev = out[out.length - 1], end = t.x + t.w;
    if (prev && text === ':') { prev.text = prev.text.replace(/\s*:$/, '') + ' :'; prev.end = end; } // "Product:" + ":" → "Product :"
    else if (prev && prev.bold === t.bold && Math.abs(prev.size - t.size) < 0.01 && t.x - prev.end < 1.5 * t.size) { prev.text += ` ${text}`; prev.end = end; }
    else out.push({ text, size: t.size, bold: t.bold, end });
  }
  return out.map(({ text, size, bold }) => ({ text, size: +size.toFixed(2), bold }));
};

const linesOf = (ts: Text[]): Line[] => {
  const groups: Text[][] = [];
  for (const t of [...ts].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g[0].y - t.y) <= 2.5) g.push(t); else groups.push([t]);
  }
  return groups.map(g => ({ runs: runsOf(g.sort((a, b) => a.x - b.x)) })).filter(l => l.runs.length);
};

// Labels are found by clustering the barcodes' centres into columns and
// rows; cell borders sit halfway between neighbours. Text is assigned to
// the cell it falls in, so a cell with text but no barcode still becomes a
// (bar-less) label rather than being dropped.
const cluster = (vals: number[]) => { const cs: number[] = []; for (const v of [...vals].sort((a, b) => a - b)) if (!cs.length || v - cs[cs.length - 1] > 6) cs.push(v); return cs; };
const idx = (cs: number[], v: number) => Math.max(0, cs.findIndex((c, i) => i === cs.length - 1 || v < (c + cs[i + 1]) / 2));

function labelsOf(sink: Sink, page: number): IndyaLabel[] {
  const placed = sink.placed.length ? sink.placed : [{ x0: 0, y0: -Infinity, x1: Infinity, y1: 0, bars: mkBars(sink.rects.filter(r => r[3] > 4 * r[2])), sku: '' }];
  const cols = cluster(placed.map(b => (b.x0 + b.x1) / 2)), rows = cluster(placed.map(b => (b.y0 + b.y1) / 2));
  const cells = new Map<string, { bc: Placed | null; texts: Text[] }>();
  const key = (x: number, y: number) => `${idx(rows, y)}:${idx(cols, x)}`;
  for (const b of placed) { const k = key((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); if (!cells.get(k)?.bc) cells.set(k, { bc: b, texts: cells.get(k)?.texts ?? [] }); }
  for (const t of sink.texts) { const k = key(t.x, t.y); const c = cells.get(k) ?? { bc: null, texts: [] }; c.texts.push(t); cells.set(k, c); }
  const order = (k: string) => { const [r, c] = k.split(':').map(Number); return (rows.length - 1 - r) * 1000 + c; }; // top row first, then left to right
  return [...cells.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([, { bc, texts }]) => {
    const b = bc ?? { x0: 0, y0: -Infinity, x1: Infinity, y1: 0, bars: null, sku: '' };
    const right = texts.filter(t => t.x >= b.x1 - 2), rest = texts.filter(t => t.x < b.x1 - 2);
    const footer = rest.filter(t => t.y < b.y0 - 1), left = rest.filter(t => t.y >= b.y0 - 1);
    return { sku: b.sku, bars: b.bars, left: linesOf(left), right: linesOf(right), footer: linesOf(footer), page };
  }).filter(l => l.bars || l.left.length || l.right.length || l.footer.length);
}

/** Every label in the PDF, in page order then reading order within a page. */
export async function parseIndyaBarcodePdf(bytes: Uint8Array): Promise<IndyaLabel[]> {
  const doc = PdfDoc.load(bytes), pages = doc.pages();
  if (!pages.length) throw new Error('No pages found in the PDF');
  const out: IndyaLabel[] = [];
  for (let i = 0; i < pages.length; i++) {
    const sink: Sink = { texts: [], rects: [], placed: [] };
    await run(doc, await doc.pageContent(pages[i]), doc.dict(doc.inherited(pages[i], 'Resources')), I, sink, 0);
    out.push(...labelsOf(sink, i + 1));
  }
  return out;
}
