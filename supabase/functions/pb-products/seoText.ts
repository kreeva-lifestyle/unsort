// Pure word-level helpers for the listing checks (seoCheck.ts): plain text
// from the listing's simple HTML, words, shared word runs between two texts
// and phrase counts. No I/O — tested in test/seoCheck.test.mjs.

export const plainText = (html: unknown) =>
  String(html ?? '').replace(/<\/(p|li|h[1-6]|ul)\s*>|<br\s*\/?>/gi, ' . ').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Lower-case words (letters and digits of any script); an apostrophe stays inside its word. */
export const wordsOf = (text: unknown): string[] =>
  plainText(text).toLowerCase().replace(/[‘’]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) ?? [];

/** The first sentence of a description (for "open differently than"). */
export const opening = (html: unknown) => (plainText(html).split(/(?<=[.!?])\s+/)[0] || '').replace(/\s*\.\s*$/, '').trim();

/** How many times the phrase's words appear in a row in the text. */
export function countPhrase(text: unknown, phrase: unknown): number {
  const w = wordsOf(text), k = wordsOf(phrase);
  if (!k.length) return 0;
  let n = 0;
  for (let i = 0; i + k.length <= w.length; i++) {
    if (k.every((x, j) => w[i + j] === x)) { n++; i += k.length - 1; }
  }
  return n;
}

const isNumber = (w: string) => /^\d/.test(w);
/** Joining words: a run made of facts held together by these is still just the facts. */
const JOINERS = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'in', 'on', 'of', 'for', 'to', 'is', 'are', 'it', 'its', 'this', 'that', 'at', 'by', 'from', 'as', 'has', 'have', 'be', 'can', 'will', 'your', 'you', 'our', 'we']);

/** Word runs of at least `min` words that `mine` shares with any of `theirs`, longest first.
 *  A run is reported only when at least `minOwn` of its words are wording rather than facts
 *  (`facts` = the words of the product's own fact values; numbers and joining words such as
 *  "and", "with", "in" do not count): both stores must be able to say "comes with Kurta, Pant
 *  and Dupatta" or "ships in 5 to 7 days". */
export function copiedRuns(mine: unknown, theirs: unknown[], facts: Set<string>, min = 5, minOwn = 3): string[] {
  const a = wordsOf(mine);
  const found = new Map<string, number>();
  for (const t of theirs) {
    const b = wordsOf(t);
    if (b.length < min || a.length < min) continue;
    const hay = ` ${b.join(' ')} `;
    const grams = new Set<string>();
    for (let i = 0; i + min <= b.length; i++) grams.add(b.slice(i, i + min).join(' '));
    for (let i = 0; i + min <= a.length; i++) {
      if (!grams.has(a.slice(i, i + min).join(' '))) continue;
      let j = i + min; // extend while the longer run is still in their text
      while (j < a.length && hay.includes(` ${a.slice(i, j + 1).join(' ')} `)) j++;
      const run = a.slice(i, j);
      const own = run.filter(w => !facts.has(w) && !isNumber(w) && !JOINERS.has(w)).length;
      if (own >= minOwn) found.set(run.join(' '), run.length);
      i = j - 1;
    }
  }
  return [...found.entries()].sort((x, y) => y[1] - x[1]).map(([r]) => r);
}

/** The words of the product's fact values, for copiedRuns' exemption. */
export const factWords = (values: unknown[]): Set<string> => new Set(values.flatMap(v => wordsOf(v)));

/** Text between a heading that matches `re` and the next heading (or the end). '' when there is no such heading. */
export function sectionAfter(html: unknown, re: RegExp): string {
  const parts = String(html ?? '').split(/<h[1-6][^>]*>/i);
  for (const part of parts.slice(1)) {
    const [head, ...rest] = part.split(/<\/h[1-6]\s*>/i);
    if (re.test(plainText(head))) return plainText(rest.join(' '));
  }
  return '';
}
