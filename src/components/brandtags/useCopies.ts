// Copies + / − on a label row. The number moves at once; the save is sent
// when the taps stop for half a second, so ten quick taps are one write (and
// one live-update message to other screens), not ten (owner, 2026-11-10).
// If the save fails the number goes back to what it was before the taps.
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import type { BrandTagRow } from './tagModel';

const SAVE_AFTER_MS = 500;
interface Pending { base: number; value: number; timer: ReturnType<typeof setTimeout> }

export function useCopies(
  setRows: Dispatch<SetStateAction<BrandTagRow[]>>,
  addToast: (message: string, type?: string) => void,
) {
  const pending = useRef(new Map<string, Pending>());

  const save = useCallback(async (id: string) => {
    const p = pending.current.get(id);
    if (!p) return;
    pending.current.delete(id);
    if (p.value === p.base) return;
    const { error } = await supabase.from('brand_tags').update({ copies: p.value }).eq('id', id);
    if (!error) return;
    // Taps that came in while this save was on its way keep their number, but
    // now fall back to the last value that really is saved.
    const next = pending.current.get(id);
    if (next) next.base = p.base;
    else setRows(prev => prev.map(r => (r.id === id ? { ...r, copies: p.base } : r)));
    addToast(friendlyError(error), 'error');
  }, [setRows, addToast]);

  const bump = useCallback((row: BrandTagRow, delta: number) => {
    const cur = pending.current.get(row.id);
    const saved = cur ? cur.base : (row.copies || 0);
    const value = Math.max(0, (cur ? cur.value : saved) + delta);
    if (cur) clearTimeout(cur.timer);
    pending.current.set(row.id, { base: saved, value, timer: setTimeout(() => void save(row.id), SAVE_AFTER_MS) });
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, copies: value } : r)));
  }, [save, setRows]);

  /** True while a label's copies are waiting to be saved from this screen. */
  const isBusy = useCallback((id: string) => pending.current.has(id), []);

  // Leaving the page: send what is still waiting instead of dropping it.
  useEffect(() => {
    const map = pending.current;
    return () => { [...map.entries()].forEach(([id, p]) => { clearTimeout(p.timer); void save(id); }); };
  }, [save]);

  return { bump, isBusy };
}
