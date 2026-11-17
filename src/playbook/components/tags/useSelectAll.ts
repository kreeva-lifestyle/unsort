// "Select all" on the suggestions (owner, 2026-11-17: "if i will do 20 per page it will take a lot of time. select
// all should work for all tags"): every pending suggestion under the chip, not just the 20 on screen. Their ids come
// in one read (suggestions_ids); Ignore / Same as nearest / Add then go 100 at a time as ONE bulk change — the server
// keeps the batches together (tagsSuggestAct.ts), so Settings → Bulk changes takes the whole lot back in one tap. The
// button counts the batches ("Ignoring… 300 / 998"); leaving the page mid-way asks first. A batch that fails stops
// the run there and says how far it got.
import { useEffect, useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import { UNDO_HINT } from '../../data/websites';
import { plural } from './tagText';

const BATCH = 100;
export type AllAct = 'ignore' | 'nearest' | 'add';
export interface AllProgress { act: AllAct; sent: number; total: number }

const what = (act: AllAct, n: number, attribute: string) => !n ? ''
  : act === 'ignore' ? `Ignored ${plural(n, 'suggestion')}`
  : act === 'nearest' ? `Filed ${plural(n, 'suggestion')} under ${n === 1 ? 'its nearest value' : 'their nearest values'}`
  : `Added ${plural(n, 'value')} to ${attribute}`;
const left = (act: AllAct, skipped: number, held: number) =>
  act === 'nearest' && skipped ? `${plural(skipped, 'suggestion')} left as ${skipped === 1 ? 'it was' : 'they were'}: no nearest value yet`
  : act === 'add' && held ? `${plural(held, 'suggestion')} not added: each looks like a value you already have — add ${held === 1 ? 'it' : 'them'} one by one`
  : '';

export function useSelectAll(api: TagsApi, addToast: AddToast, onChanged: () => void) {
  /** Every id under the chip once "Select all N" is tapped; null = only what is ticked on the page. */
  const [ids, setIds] = useState<string[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<AllProgress | null>(null);
  const running = !!progress;
  useEffect(() => {
    if (!running) return;
    const stay = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [running]);

  const pick = async (attributeId: string) => {
    setPicking(true);
    try { setIds(await api.suggestionIds(attributeId)); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setPicking(false); }
  };

  /** `attribute`: the chip's attribute name (Add only). */
  const run = async (act: AllAct, attribute = '') => {
    if (!ids?.length || running) return;
    let runId: string | null = null, done = 0, skipped = 0, retagged = 0, held = 0, sent = 0;
    setProgress({ act, sent: 0, total: ids.length });
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const last = i + BATCH >= ids.length;
        const r = await api.actSuggestions({ ids: ids.slice(i, i + BATCH), act, ...(last ? {} : { more: true }), ...(runId ? { run_id: runId } : {}) });
        runId = r.run_id ?? runId;
        done += r.done; skipped += r.skipped; retagged += r.retagged; held += Object.keys(r.conflicts).length;
        sent = Math.min(ids.length, i + BATCH);
        setProgress({ act, sent, total: ids.length });
      }
      const parts = [what(act, done, attribute), done && retagged ? `${plural(retagged, 'product')} tagged` : '', left(act, skipped, held), done > 1 ? UNDO_HINT : ''].filter(Boolean);
      addToast(parts.length ? parts.join(' · ') : 'Nothing changed: they were already handled.', done ? 'success' : 'info');
    } catch (e) {
      addToast(`Stopped after ${sent.toLocaleString('en-IN')} of ${ids.length.toLocaleString('en-IN')}: ${friendlyError(e)}${sent ? ` What was done so far is in Settings → Bulk changes.` : ''}`, 'error');
    } finally { setProgress(null); setIds(null); onChanged(); }
  };
  return { ids, setIds, picking, pick, progress, run };
}
export type SelectAll = ReturnType<typeof useSelectAll>;
