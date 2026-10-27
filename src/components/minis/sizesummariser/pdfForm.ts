// Reading the customer's form PDF on the device with pdf.js (loaded on
// first use): the text of every page in reading order, a JPEG of every page
// that holds an answer (the only place a ticked radio button can be seen),
// and the illustrations on each page (pdfImages). Forms come in many
// shapes — Google Forms "print", Chrome "Save as PDF", "Microsoft Print to
// PDF" (no text layer at all: every word is drawn), phone scans — so a page
// without text is never thrown away: it is pictured and sent, and the
// server reads it twice (see size-summariser verify.ts).
import { logSwallowed } from '../../../lib/errorLogger';
import { pageImages } from './pdfImages';

export interface FormPage { n: number; text: string; image?: string; hasOptions: boolean; isAnswer: boolean; textless: boolean }
export interface FormDiagram { page: number; k: number; top: number; area: number; blob: Blob; hash: string }
export interface FormRead { pages: FormPage[]; pageCount: number; formType: string; formTitle: string; diagrams: FormDiagram[]; textless: boolean }

const RASTER_DPI = 110;
const RASTER_DPI_TEXTLESS = 130;   // the picture is all the model has, so a little sharper
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

const STAMP = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(\s*[AP]M)?\s*/i;
/** Print boilerplate: the running header (date, form title), the footer URL, "n/30", Google's lines. */
const boiler = (line: string, title: string) =>
  /docs\.google\.com|google forms|neither created nor endorsed|this form was created inside/i.test(line) || /^\d{1,3}\s*\/\s*\d{1,3}$/.test(line) ||
  STAMP.test(line) || (!!title && line === title);

const guessType = (t: string) => (/saree\s*blouse|blouse\s*stitching/i.test(t) ? 'saree_blouse' : /lehenga|lehnga|lehanga|ghagra/i.test(t) ? 'lehenga' : /\bsuit\b|kurta|salwar|anarkali/i.test(t) ? 'suit' : /gown/i.test(t) ? 'gown' : 'unknown');

const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('canvas'))), type, q));

export async function readForm(file: File, onProgress: (done: number, total: number) => void, opts: { rasterOnlyOptionPages?: boolean } = {}): Promise<FormRead> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages — a measurement form has 10 to 30`);
    const pages: FormPage[] = [], diagrams: FormDiagram[] = [];
    let formTitle = '', formType = 'unknown';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const raw = linesOf((await page.getTextContent()).items as { str: string; transform: number[] }[]);
      if (n === 1 && raw.length) {
        // The print header is "<date>, <time> <form title>"; the title is what follows the stamp.
        formTitle = raw.map(l => l.replace(STAMP, '')).find(l => /form/i.test(l) && l.length < 80) || '';
        formType = guessType(formTitle) !== 'unknown' ? guessType(formTitle) : guessType(raw.join('\n'));
      }
      const lines = raw.filter(l => !boiler(l, formTitle));
      const text = lines.join('\n');
      const textless = raw.length === 0;
      const isAnswer = textless || lines.length >= 2 || /\d/.test(text);
      const hasOptions = textless || lines.filter(l => l.length <= 40 && !/\d/.test(l)).length >= 3;
      const pg: FormPage = { n, text, isAnswer, hasOptions, textless };
      if (isAnswer && (textless || !opts.rasterOnlyOptionPages || hasOptions)) {
        const vp = page.getViewport({ scale: (textless ? RASTER_DPI_TEXTLESS : RASTER_DPI) / 72 });
        const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        pg.image = await toBase64(await toBlob(c, 'image/jpeg', 0.72));
      }
      pages.push(pg);
      try { (await pageImages(page, pdfjs.OPS)).forEach((im, k) => diagrams.push({ page: n, k, ...im })); }
      catch (e) { logSwallowed('form pictures', e); }
      page.cleanup();
      onProgress(n, doc.numPages);
    }
    const textless = pages.every(p => p.textless);
    // With a text layer we can tell a non-form early; without one the server decides (no measurements → refused).
    if (!textless && formType === 'unknown' && !pages.some(p => /measurement|stitch|bust|waist|blouse/i.test(p.text))) throw new Error('This does not look like a stitching measurement form');
    return { pages, pageCount: doc.numPages, formType, formTitle, diagrams, textless };
  } finally { await doc.destroy(); }
}
