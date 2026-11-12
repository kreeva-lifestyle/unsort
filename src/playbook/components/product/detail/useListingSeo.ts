// The listing editor's second half: the search phrase the listing is written
// for and its two questions (FAQ), with what the checks noted and the facts
// the writer missed (data/listingSeo.ts). Loaded when the editor opens; a
// phrase or a question typed here is kept by Regenerate, an emptied one goes
// back to the AI. The editor saves this with its own Save.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../../../lib/friendlyError';
import { getListingSeo, saveListingSeo } from '../../../data/listingSeo';
import type { PbFaq, PbListingSeo } from '../../../seoTypes';

export type SeoForm = { keyword: string; q1: string; a1: string; q2: string; a2: string };
const toForm = (s: PbListingSeo | null): SeoForm => ({
  keyword: s?.keyword ?? '', q1: s?.faq[0]?.q ?? '', a1: s?.faq[0]?.a ?? '', q2: s?.faq[1]?.q ?? '', a2: s?.faq[1]?.a ?? '',
});
const FAQ_KEYS: (keyof SeoForm)[] = ['q1', 'a1', 'q2', 'a2'];

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
  const problem = () => ([[f.q1, f.a1], [f.q2, f.a2]].some(([q, a]) => !!q.trim() !== !!a.trim()) ? 'Each question needs its answer (or empty both to drop it)' : '');

  /** Save what changed. Throws on failure; returns which parts were saved. */
  const save = async (): Promise<{ keyword: boolean; faq: boolean }> => {
    const keyword = changed.includes('keyword'), faqChanged = changed.some(k => FAQ_KEYS.includes(k));
    if (!keyword && !faqChanged) return { keyword: false, faq: false };
    const faq: PbFaq[] = [{ q: f.q1.trim(), a: f.a1.trim() }, { q: f.q2.trim(), a: f.a2.trim() }].filter(x => x.q && x.a);
    await saveListingSeo(listingId, { ...(keyword ? { keyword: f.keyword } : {}), ...(faqChanged ? { faq } : {}) });
    await load(true);
    return { keyword, faq: faqChanged };
  };

  return { seo, loadErr, f, set, changed, problem, save, reload: () => load() };
}
export type ListingSeoState = ReturnType<typeof useListingSeo>;
