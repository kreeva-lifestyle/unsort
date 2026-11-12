// The listing editor's second half: the search phrase the listing is written
// for and its questions (FAQ: two to five, owner 2026-11-12), with what the checks noted and the facts
// the writer missed (data/listingSeo.ts). Loaded when the editor opens; a
// phrase or a question typed here is kept by Regenerate, an emptied one goes
// back to the AI. The editor saves this with its own Save.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { getListingSeo, saveListingSeo } from '../../../data/listingSeo';
import type { PbFaq, PbListingSeo } from '../../../seoTypes';

/** The question numbers a listing can hold. */
export const FAQ_SLOTS = [1, 2, 3, 4, 5] as const;
type Slot = typeof FAQ_SLOTS[number];
export type FaqKey = `q${Slot}` | `a${Slot}`;
export type SeoForm = { keyword: string } & Record<FaqKey, string>;
const toForm = (s: PbListingSeo | null): SeoForm => ({
  keyword: s?.keyword ?? '',
  ...Object.fromEntries(FAQ_SLOTS.flatMap(n => [[`q${n}`, s?.faq[n - 1]?.q ?? ''], [`a${n}`, s?.faq[n - 1]?.a ?? '']])),
} as SeoForm);
const FAQ_KEYS = FAQ_SLOTS.flatMap(n => [`q${n}`, `a${n}`]) as (keyof SeoForm)[];

export function useListingSeo(listingId: string) {
  const [seo, setSeo] = useState<PbListingSeo | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [f, setF] = useState<SeoForm>(() => toForm(null));

  /** `keep`: after our own save the form is already what was saved; a first load or Retry fills it. */
  const load = useCallback(async (keep = false) => {
    try {
      const next = await getListingSeo(listingId);
      setSeo(next); setLoadErr('');
      if (!keep) setF(toForm(next));
    } catch (e) { setLoadErr(friendlyError(e)); }
  }, [listingId]);
  useEffect(() => { void load(); }, [load]);

  const orig = toForm(seo);
  const changed = seo ? (Object.keys(f) as (keyof SeoForm)[]).filter(k => f[k].trim() !== orig[k].trim()) : [];
  const set = (k: keyof SeoForm) => (v: string) => setF(x => ({ ...x, [k]: v }));

  /** '' when the form can be saved; else the sentence to show. */
  const problem = () => (FAQ_SLOTS.some(n => !!f[`q${n}`].trim() !== !!f[`a${n}`].trim()) ? 'Each question needs its answer (or empty both to drop it)' : '');

  /** Save what changed. Throws on failure; returns which parts were saved. */
  const save = async (): Promise<{ keyword: boolean; faq: boolean }> => {
    const keyword = changed.includes('keyword'), faqChanged = changed.some(k => FAQ_KEYS.includes(k));
    if (!keyword && !faqChanged) return { keyword: false, faq: false };
    const faq: PbFaq[] = FAQ_SLOTS.map(n => ({ q: f[`q${n}`].trim(), a: f[`a${n}`].trim() })).filter(x => x.q && x.a);
    await saveListingSeo(listingId, { ...(keyword ? { keyword: f.keyword } : {}), ...(faqChanged ? { faq } : {}) });
    await load(true);
    return { keyword, faq: faqChanged };
  };

  return { seo, loadErr, f, set, changed, problem, save, reload: () => load() };
}
export type ListingSeoState = ReturnType<typeof useListingSeo>;
