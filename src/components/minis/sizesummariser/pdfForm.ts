// Reading the customer's Google Forms response PDF on the device with
// pdf.js (loaded on first use): the text of every page in reading order,
// a JPEG of every page that holds an answer (the only place a ticked radio
// button can be seen), and the illustration on each page — composited on
// white, cropped, hashed, so the same picture is stored once across forms.
import { logSwallowed } from '../../../lib/errorLogger';

export interface FormPage { n: number; text: string; image?: string; hasOptions: boolean; isAnswer: boolean }
export interface FormDiagram { page: number; blob: Blob; hash: string }
export interface FormRead { pages: FormPage[]; pageCount: number; formType: string; formTitle: string; diagrams: FormDiagram[] }

const RASTER_DPI = 110;
const MAX_PAGES = 60;

// Browsers before Safari 17.4 / Chrome 119 lack this; pdf.js 4 calls it.
const P = Promise as PromiseConstructor & { withResolvers?: () => unknown };
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T | PromiseLike<T>) => void, reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

/** Lines in reading order from pdf.js text items (grouped by baseline, left to right). */
function linesOf(items: { str: string; transform: number[] }[]): string[] {
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;   // same baseline within 3pt
    rows.set(y, [...(rows.get(y) || []), { x: it.transform[4], s: it.str }]);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim());
}

/** Google Forms print boilerplate: the running header (date, form title), the footer URL, "n/30", Google's disclaimer. */
const boiler = (line: string, title: string) =>
  /docs\.google\.com|google forms|neither created nor endorsed/i.test(line) || /^\d{1,3}\s*\/\s*\d{1,3}$/.test(line) ||
  /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(line) || (!!title && line === title);

const guessType = (t: string) => (/saree\s*blouse/i.test(t) ? 'saree_blouse' : /lehenga|lehnga|lehanga/i.test(t) ? 'lehenga' : /\bsuit\b|kurta|salwar/i.test(t) ? 'suit' : /gown/i.test(t) ? 'gown' : 'unknown');

const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('canvas'))), type, q));

/** The page's illustration: the largest image drawn on it, composited on white and cropped. null when there is none. */
async function diagramOf(page: any, pdfjs: any): Promise<Blob | null> {
  const ops = await page.getOperatorList();
  let best: { w: number; h: number; name: string } | null = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const name = ops.argsArray[i][0];
    const img = await new Promise<any>(res => { try { page.objs.get(name, res); } catch { res(null); } });
    if (img?.width >= 60 && img?.height >= 60 && (!best || img.width * img.height > best.w * best.h)) best = { w: img.width, h: img.height, name };
  }
  if (!best) return null;
  const img = await new Promise<any>(res => page.objs.get(best!.name, res));
  const c = document.createElement('canvas'); c.width = best.w; c.height = best.h;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const n = best.w * best.h, src: Uint8ClampedArray = img.data, out = new Uint8ClampedArray(n * 4), ch = src.length / n;
    for (let i = 0; i < n; i++) { const o = i * 4; if (ch >= 3) { out[o] = src[i * ch]; out[o + 1] = src[i * ch + 1]; out[o + 2] = src[i * ch + 2]; out[o + 3] = ch === 4 ? src[i * ch + 3] : 255; } else { out[o] = out[o + 1] = out[o + 2] = src[i]; out[o + 3] = 255; } }
    const tmp = document.createElement('canvas'); tmp.width = best.w; tmp.height = best.h;
    tmp.getContext('2d')!.putImageData(new ImageData(out, best.w, best.h), 0, 0); ctx.drawImage(tmp, 0, 0);
  } else return null;
  // Crop to the drawing (anything not white), with a small margin.
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const o = (y * c.width + x) * 4; if (d[o] < 245 || d[o + 1] < 245 || d[o + 2] < 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) return null;
  const m = 4, cw = Math.min(c.width, x1 - x0 + 1 + 2 * m), chh = Math.min(c.height, y1 - y0 + 1 + 2 * m);
  const out = document.createElement('canvas'); out.width = cw; out.height = chh;
  out.getContext('2d')!.drawImage(c, Math.max(0, x0 - m), Math.max(0, y0 - m), cw, chh, 0, 0, cw, chh);
  return toBlob(out, 'image/png');
}

const sha1 = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');

export async function readForm(file: File, onProgress: (done: number, total: number) => void, opts: { rasterOnlyOptionPages?: boolean } = {}): Promise<FormRead> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages — a measurement form has 20 to 30`);
    const pages: FormPage[] = [], diagrams: FormDiagram[] = [];
    let formTitle = '', formType = 'unknown';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const raw = linesOf((await page.getTextContent()).items as { str: string; transform: number[] }[]);
      if (n === 1) { formTitle = raw.find(l => /form/i.test(l) && l.length < 80) || ''; formType = guessType(raw.join('\n')); }
      const lines = raw.filter(l => !boiler(l, formTitle));
      const text = lines.join('\n');
      const isAnswer = lines.length >= 2 || /\d/.test(text);
      const hasOptions = lines.filter(l => l.length <= 40 && !/\d/.test(l)).length >= 3;
      const pg: FormPage = { n, text, isAnswer, hasOptions };
      if (isAnswer && (!opts.rasterOnlyOptionPages || hasOptions)) {
        const vp = page.getViewport({ scale: RASTER_DPI / 72 });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        pg.image = await toBase64(await toBlob(c, 'image/jpeg', 0.72));
      }
      pages.push(pg);
      try { const blob = await diagramOf(page, pdfjs); if (blob) diagrams.push({ page: n, blob, hash: await sha1(blob) }); }
      catch (e) { logSwallowed('form diagram', e); }
      page.cleanup();
      onProgress(n, doc.numPages);
    }
    if (formType === 'unknown' && !pages.some(p => /measurement|stitch/i.test(p.text))) throw new Error('This does not look like a stitching measurement form');
    return { pages, pageCount: doc.numPages, formType, formTitle, diagrams };
  } finally { await doc.destroy(); }
}
