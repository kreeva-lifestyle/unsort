// Pure: what a program can check about one store's listing, in place of the
// writer's own "self check" (owner, 2026-11-12). A HARD problem keeps the
// listing from going out on its own (it waits in Needs review with the
// reason); a soft one is only noted. Either kind is sent back to the writer
// once to fix (genWrite.ts). Each problem has a sentence for the owner (`say`)
// and an instruction for the writer (`fix`).
//   copied      a run of 5+ words shared with the supplier's text or another
//               store's version (facts may repeat: seoText.ts copiedRuns)
//   same title / meta title / opening as another store's version
//   keyword     once in the title (when the AI writes it), in the first 50
//               words and in the meta title; not stuffed
//   brand       the meta title ends with the brand name
//   names       supplier name, design code, links, phone numbers
//   claims      "No. 1", fake scarcity, invented reviews
//   ordering    a number in "Ordering from …" that the store profile does not give
// No I/O — tested in test/seoCheck.test.mjs.
import { copyTells } from './humanCopy.ts';
import { copiedRuns, countPhrase, factWords, opening, plainText, sectionAfter, wordsOf } from './seoText.ts';

export interface Faq { q: string; a: string }
export interface Version { title: string; description_html: string; seo_title: string; seo_description: string; image_alts: string[] }
export interface Copy extends Version { faq: Faq[] }
export interface CheckInput {
  copy: Copy; keyword: string; brand: string;
  /** The title is the AI's own (the title pattern is {ai_title}); a pattern-built title is the owner's choice. */
  aiTitle: boolean;
  source: string; others: Version[]; facts: unknown[];
  vendor: string; sku: string;
  /** The profile's delivery + stitching + returns text ('' = no ordering block is written). */
  ordering: string;
  limits: { metaDescMin: number; metaDescMax: number; wordsMin: number; wordsMax: number };
}
export interface Problem { code: string; hard: boolean; say: string; fix: string }

const q = (s: string) => `"${s.length > 90 ? `${s.slice(0, 90).trimEnd()}…` : s}"`;
const same = (a: unknown, b: unknown) => { const x = wordsOf(a).join(' '); return !!x && x === wordsOf(b).join(' '); };
const noBrand = (t: string) => t.split('|')[0];
const CLAIMS = /\bno\.?\s*1\b|\bnumber one\b|#\s*1\b|\bonly \d+ (?:left|pieces? left)\b|\b(?:selling|going) fast\b|\blimited stock\b|\bhurry\b|\b\d(?:\.\d)?\s*stars?\b|\b(?:customers?|buyers?) (?:love|say|rave)\b|\btop[- ]rated\b/i;
const LINKS = /https?:\/\/|\bwww\.|\b[a-z0-9-]{3,}\.(?:com|in|co|net|org|shop|store)\b|[\w.+-]+@[\w-]+\.\w+|(?:\+?\d[\s-]?){9,}/i;
const whole = (text: string, name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(text);

export function checkCopy(i: CheckInput): Problem[] {
  const c = i.copy, out: Problem[] = [];
  const add = (code: string, hard: boolean, say: string, fix: string) => out.push({ code, hard, say, fix });
  const desc = plainText(c.description_html);
  const faq = (c.faq || []).map(f => `${f.q} ${f.a}`).join(' . ');
  const written = [i.aiTitle ? c.title : '', desc, c.seo_title, c.seo_description, faq, ...(c.image_alts || [])].join(' . ');

  const facts = factWords(i.facts);
  const theirs = [i.source, ...i.others.flatMap(o => [o.description_html, o.seo_description])];
  const runs = [...new Set([desc, c.seo_description, faq].flatMap(t => copiedRuns(t, theirs, facts)))].slice(0, 4);
  if (runs.length) add('copied', true, `Copies wording from the supplier's text or another store's version: ${runs.map(q).join(', ')}.`,
    `These phrases are copied. Say the same facts in new words and a new sentence shape: ${runs.map(q).join('; ')}.`);

  if (i.aiTitle) {
    const twin = i.others.find(o => same(o.title, c.title));
    if (twin) add('same_title', true, 'The title is the same as on another store.', `Write a different title than "${twin.title}" (another order or other details, still per the title formula).`);
  }
  const metaTwin = i.others.find(o => same(noBrand(o.seo_title), noBrand(c.seo_title)));
  if (metaTwin) add('same_meta', true, 'The SEO title is the same as on another store.', `Write a different meta title than "${metaTwin.seo_title}".`);
  const mine = wordsOf(opening(c.description_html)).slice(0, 4).join(' ');
  const twinOpen = mine && i.others.find(o => wordsOf(opening(o.description_html)).slice(0, 4).join(' ') === mine);
  if (twinOpen) add('opening', true, 'The description opens the same way as on another store.',
    `Open the description with a different product attribute and different words than: ${q(opening(twinOpen.description_html))}.`);

  if (i.keyword) {
    const k = q(i.keyword);
    const inTitle = countPhrase(c.title, i.keyword);
    if (i.aiTitle && inTitle !== 1) add('keyword_title', true, `The search phrase ${k} ${inTitle ? 'is in the title more than once' : 'is not in the title'}.`, `Use the primary keyword ${k} exactly once in the title, word for word.`);
    if (!countPhrase(wordsOf(desc).slice(0, 50).join(' '), i.keyword)) add('keyword_start', true, `The search phrase ${k} is not in the first 50 words of the description.`, `Use the primary keyword ${k} once, word for word, in the first 50 words of the description.`);
    if (countPhrase(c.seo_title, i.keyword) !== 1) add('keyword_meta', true, `The search phrase ${k} is not in the SEO title exactly once.`, `Use the primary keyword ${k} exactly once in seo_title, word for word.`);
    if (countPhrase(desc, i.keyword) > 3) add('keyword_stuffed', false, `The search phrase ${k} is repeated too often in the description.`, `Use the primary keyword at most twice in the description.`);
  }
  if (i.brand && !wordsOf(c.seo_title).join(' ').endsWith(wordsOf(i.brand).join(' '))) add('brand', true, `The SEO title does not end with ${i.brand}.`, `End seo_title with "| ${i.brand}".`);

  const named = [i.vendor.trim().length >= 3 && whole(written, i.vendor.trim()) ? `the supplier's name (${i.vendor.trim()})` : '',
    i.sku.trim().length >= 4 && /\d/.test(i.sku) && whole(written, i.sku.trim()) ? `the design code (${i.sku.trim()})` : '',
    LINKS.test(written) ? 'a link, email or phone number' : ''].filter(Boolean);
  if (named.length) add('names', true, `Mentions ${named.join(' and ')}.`, `Remove ${named.join(' and ')} everywhere.`);
  const claim = CLAIMS.exec(written)?.[0];
  if (claim) add('claims', true, `Makes a claim the facts do not support: ${q(claim)}.`, `Remove ${q(claim)} and any other ranking, scarcity or review claim.`);

  if (i.ordering) {
    const block = sectionAfter(c.description_html, /ordering from/i);
    const given = new Set(i.ordering.match(/\d+/g) ?? []);
    const extra = [...new Set(block.match(/\d+/g) ?? [])].filter(n => !given.has(n));
    if (extra.length) add('ordering', true, `The ordering section gives a number that is not in the store profile: ${extra.join(', ')}.`, `In "Ordering from", use only the delivery time, stitching and returns given in the store profile. Remove: ${extra.join(', ')}.`);
  }

  const L = i.limits, n = wordsOf(desc).length, m = c.seo_description.length;
  if (m < L.metaDescMin || m > L.metaDescMax) add('meta_length', false, `The SEO description is ${m} characters (aim for ${L.metaDescMin} to ${L.metaDescMax}).`, `Make seo_description ${L.metaDescMin} to ${L.metaDescMax} characters (it is ${m}).`);
  if (n > L.wordsMax * 1.15) add('too_long', false, `The description is ${n} words (the limit is ${L.wordsMax}).`, `Cut the description to at most ${L.wordsMax} words (it is ${n}).`);
  const alts = (c.image_alts || []).map(a => wordsOf(a).join(' ')).filter(Boolean);
  const dupAlt = alts.length !== new Set(alts).size || i.others.some(o => (o.image_alts || []).some((a, x) => !!alts[x] && wordsOf(a).join(' ') === alts[x]));
  if (dupAlt) add('alts', false, 'Some photo descriptions repeat (in this listing or another store\'s).', 'Make every image alt text different from the others and from the other stores\' alt texts.');
  const tells = copyTells(`${c.title}. ${c.description_html} ${c.seo_title}. ${c.seo_description} ${faq}`);
  if (tells.length) add('tells', false, `Reads like sales copy in places (${tells.join(', ')}).`, `Rewrite the sentences with these patterns as plain facts: ${tells.join(', ')}.`);
  return out;
}

export const hardOf = (p: Problem[]) => p.filter(x => x.hard);
/** Fewer hard problems wins; then fewer problems in all. */
export const better = (a: Problem[], b: Problem[]) => hardOf(a).length - hardOf(b).length || a.length - b.length;
