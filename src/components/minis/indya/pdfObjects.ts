// A minimal PDF object reader for Indya's barcode label PDFs (iTextSharp,
// plain object table, FlateDecode streams). It tokenises dictionaries,
// arrays, names, strings and references, inflates streams through the
// browser-native DecompressionStream, and walks Catalog → Pages → Kids.
// No dependency — the app already ships without a PDF library, and these
// files are tiny (a few KB). Not a general PDF parser: cross-reference
// streams / object streams (PDF 1.5+) are out of scope.

export type PdfName = { n: string };
export type PdfRef = { r: number };
export type PdfOp = { op: string };
export type PdfStr = { str: string }; // one char per byte (latin1)
export type PdfDict = Map<string, PdfVal>;
export type PdfVal = number | boolean | null | PdfVal[] | PdfDict | PdfName | PdfRef | PdfOp | PdfStr;

const WS = /[\s\x00]/;
export const isName = (v: PdfVal): v is PdfName => !!v && typeof v === 'object' && 'n' in v;
export const isRef = (v: PdfVal): v is PdfRef => !!v && typeof v === 'object' && 'r' in v;
export const isOp = (v: PdfVal): v is PdfOp => !!v && typeof v === 'object' && 'op' in v;
export const isStr = (v: PdfVal): v is PdfStr => !!v && typeof v === 'object' && 'str' in v;
export const isDict = (v: PdfVal): v is PdfDict => v instanceof Map;

export const latin1 = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);
export const toBytes = (s: string): Uint8Array => Uint8Array.from(s, c => c.charCodeAt(0) & 255);

const skipWs = (s: string, p: number): number => {
  for (;;) {
    while (p < s.length && WS.test(s[p])) p++;
    if (s[p] !== '%') return p;
    while (p < s.length && s[p] !== '\n' && s[p] !== '\r') p++;
  }
};

const literal = (s: string, p: number): [string, number] => {
  let depth = 1, out = '';
  for (; p < s.length && depth > 0; p++) {
    const c = s[p];
    if (c === '\\') {
      const e = s[++p];
      if (e === 'n') out += '\n'; else if (e === 'r') out += '\r'; else if (e === 't') out += '\t';
      else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
      else if (e >= '0' && e <= '7') { let o = e; while (o.length < 3 && s[p + 1] >= '0' && s[p + 1] <= '7') o += s[++p]; out += String.fromCharCode(parseInt(o, 8) & 255); }
      else if (e === '\r') { if (s[p + 1] === '\n') p++; }
      else if (e !== '\n') out += e;
    } else if (c === '(') { depth++; out += c; }
    else if (c === ')') { depth--; if (depth > 0) out += c; }
    else out += c;
  }
  return [out, p];
};

/** Parse one value at position p; returns it and the position after it.
 *  Structural closers (`]`, `>>`, `}`) come back as ops so callers can stop. */
export function parseValue(s: string, p: number): [PdfVal, number] {
  p = skipWs(s, p);
  if (p >= s.length) return [{ op: 'EOF' }, p];
  const c = s[p];
  if (s.startsWith('<<', p)) {
    const d: PdfDict = new Map(); p += 2;
    for (;;) {
      const [k, q] = parseValue(s, p);
      if (isOp(k)) { p = q; break; }
      const [v, r] = parseValue(s, q);
      if (isOp(v)) { p = r; break; }
      if (isName(k)) d.set(k.n, v);
      p = r;
    }
    return [d, p];
  }
  if (s.startsWith('>>', p)) return [{ op: '>>' }, p + 2];
  if (c === '[') {
    const a: PdfVal[] = []; p++;
    for (;;) { const [v, q] = parseValue(s, p); p = q; if (isOp(v)) { if (v.op !== ']' && v.op !== 'EOF') a.push(v); else break; } else a.push(v); }
    return [a, p];
  }
  if (c === ']' || c === '{' || c === '}') return [{ op: c }, p + 1];
  if (c === '/') {
    let q = p + 1; while (q < s.length && !WS.test(s[q]) && !'/[]<>(){}%'.includes(s[q])) q++;
    return [{ n: s.slice(p + 1, q).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }, q];
  }
  if (c === '(') { const [str, q] = literal(s, p + 1); return [{ str }, q]; }
  if (c === '<') {
    const e = s.indexOf('>', p); const hex = s.slice(p + 1, e < 0 ? s.length : e).replace(/[^0-9a-fA-F]/g, '');
    return [{ str: (hex.match(/../g) || []).map(h => String.fromCharCode(parseInt(h, 16))).join('') }, e < 0 ? s.length : e + 1];
  }
  const ref = /(\d+)\s+\d+\s+R(?![\w])/y; ref.lastIndex = p;
  const rm = ref.exec(s); if (rm) return [{ r: +rm[1] }, ref.lastIndex];
  const num = /[+-]?(\d+\.?\d*|\.\d+)/y; num.lastIndex = p;
  const nm = num.exec(s); if (nm) return [parseFloat(nm[0]), num.lastIndex];
  const kw = /[^\s\x00/[\]<>(){}%]+/y; kw.lastIndex = p;
  const km = kw.exec(s); const w = km ? km[0] : c;
  p += w.length || 1;
  return [w === 'true' ? true : w === 'false' ? false : w === 'null' ? null : { op: w }, p];
}

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const run = async (fmt: CompressionFormat, b: Uint8Array) =>
    new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer());
  try { return await run('deflate', raw); } catch { return run('deflate-raw', raw.subarray(2)); }
}

export class PdfDoc {
  private offsets = new Map<number, number>();
  private cache = new Map<number, PdfVal>();
  private constructor(private bytes: Uint8Array, private src: string) {}

  static load(bytes: Uint8Array): PdfDoc {
    const src = latin1(bytes);
    if (!src.startsWith('%PDF')) throw new Error('Not a PDF file');
    const doc = new PdfDoc(bytes, src);
    const re = /(\d+)\s+\d+\s+obj\b/g; let m: RegExpExecArray | null;
    while ((m = re.exec(src))) doc.offsets.set(+m[1], m.index + m[0].length); // later (incremental) copies win
    return doc;
  }

  obj(num: number): PdfVal {
    if (this.cache.has(num)) return this.cache.get(num)!;
    const off = this.offsets.get(num);
    const v = off === undefined ? null : parseValue(this.src, off)[0];
    this.cache.set(num, v); return v;
  }
  resolve(v: PdfVal): PdfVal { let guard = 0; while (isRef(v) && guard++ < 32) v = this.obj(v.r); return v; }
  dict(v: PdfVal): PdfDict | null { const r = this.resolve(v); return isDict(r) ? r : null; }
  arr(v: PdfVal): PdfVal[] | null { const r = this.resolve(v); return Array.isArray(r) ? r : null; }
  num(v: PdfVal): number | null { const r = this.resolve(v); return typeof r === 'number' && Number.isFinite(r) ? r : null; }
  name(v: PdfVal): string | null { const r = this.resolve(v); return isName(r) ? r.n : null; }
  nums(v: PdfVal): number[] | null { const a = this.arr(v); if (!a) return null; const out = a.map(x => this.num(x)); return out.every((n): n is number => n !== null) ? out : null; }

  /** The decoded bytes of stream object `num` (Flate inflated, else raw). */
  async stream(num: number): Promise<Uint8Array | null> {
    const off = this.offsets.get(num); if (off === undefined) return null;
    const [d, p] = parseValue(this.src, off); if (!isDict(d)) return null;
    let start = this.src.indexOf('stream', p); if (start < 0) return null;
    start += 6; if (this.src[start] === '\r') start++; if (this.src[start] === '\n') start++;
    let len = this.num(d.get('Length') ?? null);
    if (len === null || start + len > this.bytes.length) { const e = this.src.indexOf('endstream', start); len = (e < 0 ? this.src.length : e) - start; }
    const raw = this.bytes.subarray(start, start + len);
    const f = d.get('Filter') ?? null; const filter = this.name(f) ?? (this.arr(f)?.map(x => this.name(x))[0] ?? null);
    if (filter === 'FlateDecode') return inflate(raw);
    return filter ? null : raw; // other filters: not something these labels use
  }

  /** Page dictionaries in document order (Kids walk, falling back to a scan). */
  pages(): PdfDict[] {
    const out: PdfDict[] = [];
    const walk = (node: PdfDict | null, depth: number) => {
      if (!node || depth > 64) return;
      if (this.name(node.get('Type') ?? null) === 'Page') { out.push(node); return; }
      for (const kid of this.arr(node.get('Kids') ?? null) || []) walk(this.dict(kid), depth + 1);
    };
    for (const num of this.offsets.keys()) {
      const d = this.dict({ r: num });
      if (d && this.name(d.get('Type') ?? null) === 'Catalog') { walk(this.dict(d.get('Pages') ?? null), 0); break; }
    }
    if (!out.length) for (const num of [...this.offsets.keys()].sort((a, b) => a - b)) {
      const d = this.dict({ r: num }); if (d && this.name(d.get('Type') ?? null) === 'Page') out.push(d);
    }
    return out;
  }

  /** A page's (possibly inherited) entry, e.g. Resources or MediaBox. */
  inherited(page: PdfDict, key: string): PdfVal {
    let node: PdfDict | null = page, guard = 0;
    while (node && guard++ < 64) { const v = node.get(key); if (v !== undefined) return v; node = this.dict(node.get('Parent') ?? null); }
    return null;
  }

  /** Content bytes: a single stream or an array of streams joined with newlines. */
  async pageContent(page: PdfDict): Promise<Uint8Array> {
    const c = page.get('Contents') ?? null;
    const refs = isRef(c) ? [c] : (this.arr(c) || []).filter(isRef);
    const parts: Uint8Array[] = [];
    for (const r of refs) { const b = await this.stream(r.r); if (b) parts.push(b, new Uint8Array([10])); }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}
