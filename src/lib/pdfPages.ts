// Render a PDF the user picked (a courier label from a marketplace) into
// page images the print templates can place: one PNG per page at label
// resolution, with the page's size in inches and its text (for the AWB
// number in titles). pdf.js is loaded on first use only — it is ~1 MB and
// nothing else in the app needs it.
import { logSwallowed } from './errorLogger';

export interface PdfPageImage {
  dataUrl: string;
  widthIn: number;
  heightIn: number;
  text: string;
}

// Browsers before Safari 17.4 / Chrome 119 lack this; pdf.js 4 calls it.
const P = Promise as PromiseConstructor & { withResolvers?: () => unknown };
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (v: T | PromiseLike<T>) => void, reject!: (e?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const MAX_PIXELS = 12_000_000; // iOS canvas ceiling, with room to spare

/** Every page of `file` as a PNG at `dpi` (lower when a page would exceed the canvas limit). */
export async function renderPdfPages(file: File, dpi = 300): Promise<PdfPageImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: PdfPageImage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const widthIn = base.width / 72, heightIn = base.height / 72;
      const fit = Math.min(dpi, Math.sqrt(MAX_PIXELS / (widthIn * heightIn)));
      const vp = page.getViewport({ scale: fit / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This device could not draw the label');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      let text = '';
      try { text = (await page.getTextContent()).items.map(it => ('str' in it ? it.str : '')).join(' '); }
      catch (e) { logSwallowed('pdf text', e); }
      out.push({ dataUrl: canvas.toDataURL('image/png'), widthIn, heightIn, text });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
