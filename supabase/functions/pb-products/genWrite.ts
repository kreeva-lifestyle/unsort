// The writer's call(s) for one listing: ask, tidy what a program can tidy
// safely (humanCopy.ts), check (seoCheck.ts, through the caller's `check`),
// and when the checks find anything, ask ONCE more with the draft and the
// list of fixes (text only: the photos are not sent twice). The better of the
// two drafts is kept (fewer hard problems, then fewer in all), with what both
// calls cost. A rewrite that fails or has no time left keeps the first draft:
// the listing is never lost to its own second pass.
import { askClaude, type Block } from './ai.ts';
import { fixAsk, type GenOut } from './genPrompt.ts';
import { tidyCopy } from './humanCopy.ts';
import { plain } from './http.ts';
import { better, type Problem } from './seoCheck.ts';
import { dropSection } from './seoText.ts';
import type { Budget } from './types.ts';

/** Time a rewrite needs left; with less the first draft stands. */
export const REWRITE_NEEDS_MS = 45_000;

export interface Written { g: GenOut; usd: number; model: string; effort: string; problems: Problem[]; rewrote: boolean }

const list = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v : []).map(x => tidyCopy(x).replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);

/** A heading for the store's terms. Owner, 2026-11-12: no "Ordering from…" part in a description; it is about the product only. */
const TERMS_HEADING = /\b(?:ordering|shipping|delivery|returns?)\b/i;

/** The writer's JSON with the safe fixes: no curly quotes or long dashes, no ordering section, at most 5 questions, short lists. */
export function tidyOut(d: GenOut): GenOut {
  return {
    title: tidyCopy(d.title), description_html: dropSection(tidyCopy(d.description_html), TERMS_HEADING), seo_title: tidyCopy(d.seo_title), seo_description: tidyCopy(d.seo_description),
    handle: String(d.handle || ''), extra_tags: Array.isArray(d.extra_tags) ? d.extra_tags.map(String) : [],
    image_alts: Array.isArray(d.image_alts) ? d.image_alts.map(a => tidyCopy(a).slice(0, 110)) : [],
    faq: (Array.isArray(d.faq) ? d.faq : []).map(f => ({ q: tidyCopy(f?.q).trim().slice(0, 200), a: tidyCopy(f?.a).trim().slice(0, 500) })).filter(f => f.q && f.a).slice(0, 5),
    missing_facts: list(d.missing_facts, 8, 80),
  };
}

export async function writeCopy(a: {
  model: string; effort: string; system: string; photos: Block[]; facts: string; schema: Record<string, unknown>;
  /** Finishes a draft (brand ending, cuts) and returns it with what the checks found. */
  check: (g: GenOut) => { g: GenOut; problems: Problem[] };
  budget: Budget;
}): Promise<Written> {
  const ask = (content: Block[]) => askClaude<GenOut>({ model: a.model, effort: a.effort, system: a.system, content, schema: a.schema, maxTokens: 16000, timeoutMs: a.budget.hard - Date.now() });
  const first = await ask([...a.photos, { type: 'text', text: a.facts }]);
  const one = a.check(tidyOut(first.data));
  const out: Written = { ...one, usd: first.usd, model: first.model, effort: first.effort, rewrote: false };
  if (!one.problems.length || a.budget.hard - Date.now() < REWRITE_NEEDS_MS) return out;
  try {
    const second = await ask([{ type: 'text', text: a.facts }, { type: 'text', text: fixAsk(one.g, one.problems) }]);
    out.usd += second.usd; out.rewrote = true;
    const draft = tidyOut(second.data);
    // The rewrite did not see the photos: its alt texts are kept only where it was given the same number.
    if (draft.image_alts.length !== one.g.image_alts.length) draft.image_alts = one.g.image_alts;
    const two = a.check(draft);
    if (better(two.problems, one.problems) <= 0) { out.g = two.g; out.problems = two.problems; }
  } catch (e) {
    console.error(`pb-products rewrite: ${plain(e)}`); // the first draft stands; its problems decide what happens next
  }
  return out;
}
