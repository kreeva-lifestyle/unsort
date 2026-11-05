// The Product Directory user guide is written ONCE, as data (content/*.ts), and
// shown two ways: in the app (pages/Guide.tsx → GuideBlocks.tsx) and as the
// printable HTML + PDF (scripts/playbook-guide-pdf.cjs builds
// docs/playbook/product-directory-guide.html and
// public/playbook/product-directory-guide.pdf from the same data).
// Edit the content files, then run `node scripts/playbook-guide-pdf.cjs`.
//
// Inline marks inside any text: **Button or screen name** and `code / value`.
// This file and content/* must stay plain data (no React, no app imports) —
// the PDF script loads them in Node.

export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'tip'; text: string }
  | { kind: 'warn'; text: string };

export interface GuideSection {
  id: string;
  /** Short label for the contents list, e.g. "Step 1 · Connect a store". */
  short: string;
  title: string;
  lead?: string;
  blocks: GuideBlock[];
}

export const p = (text: string): GuideBlock => ({ kind: 'p', text });
export const h = (text: string): GuideBlock => ({ kind: 'h', text });
export const steps = (...items: string[]): GuideBlock => ({ kind: 'steps', items });
export const list = (...items: string[]): GuideBlock => ({ kind: 'list', items });
export const table = (head: string[], ...rows: string[][]): GuideBlock => ({ kind: 'table', head, rows });
export const tip = (text: string): GuideBlock => ({ kind: 'tip', text });
export const warn = (text: string): GuideBlock => ({ kind: 'warn', text });

/** Split text into plain / **bold** / `code` pieces (no nesting). */
export function splitInline(text: string): { t: 'text' | 'b' | 'code'; v: string }[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(s =>
    s.startsWith('**') && s.endsWith('**') && s.length > 4 ? { t: 'b' as const, v: s.slice(2, -2) }
      : s.startsWith('`') && s.endsWith('`') && s.length > 2 ? { t: 'code' as const, v: s.slice(1, -1) }
        : { t: 'text' as const, v: s });
}
