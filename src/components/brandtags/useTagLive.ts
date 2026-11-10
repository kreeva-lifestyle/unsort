// Live updates for the Brand Tags list: another person's edit, delete or
// import shows up on this screen without a reload.
//
// Changes are collected and applied together every 400 ms. The earlier
// version kept ONE pending change and replaced it whenever another arrived, so
// when several labels changed within 1.5 s only the last one reached the
// screen (owner, 2026-11-10). A label whose copies are still being saved from
// this screen is left alone — `isBusy` — so an older echo cannot undo taps.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../../lib/supabase';
import { toRow, type BrandTagRow, type BrandTagDb } from './tagModel';

const FLUSH_MS = 400;

export function useTagLive(
  setRows: Dispatch<SetStateAction<BrandTagRow[]>>,
  setTotalCount: Dispatch<SetStateAction<number>>,
  isBusy: (id: string) => boolean,
) {
  useEffect(() => {
    const updates = new Map<string, BrandTagRow>();
    let inserts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      if (updates.size) {
        const batch = new Map(updates);
        updates.clear();
        setRows(prev => prev.map(r => { const u = batch.get(r.id); return u && !isBusy(r.id) ? u : r; }));
      }
      if (inserts) { const n = inserts; inserts = 0; setTotalCount(c => c + n); }
    };
    const soon = () => { if (!timer) timer = setTimeout(flush, FLUSH_MS); };

    const ch = supabase.channel('bt-smart')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const u = toRow(payload.new as BrandTagDb);
        updates.set(u.id, u);
        soon();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'brand_tags' }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (!id) return;
        updates.delete(id);
        setRows(prev => prev.filter(r => r.id !== id));
        setTotalCount(c => c - 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brand_tags' }, () => { inserts++; soon(); })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [setRows, setTotalCount, isBusy]);
}
