import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface PendingDel { id: string; label: string; timer: number; table: string }

// Undo-able delete: the row leaves the caller's list immediately, the DB
// delete runs 5s later unless Undo is tapped.
//
// Two hard-won rules live here:
// - The table is carried PER PENDING DELETE (optional 3rd arg), not read from
//   the hook closure at fire time. PackStation drives two tables through one
//   hook by flipping a state variable, and scheduleDelete used to capture the
//   PREVIOUS render's table — the first camera delete after page load quietly
//   issued its DELETE against packtime_couriers, matched nothing, and the
//   camera reappeared on the next refresh.
// - Scheduling a new delete while one is pending COMMITS the pending one
//   instead of cancelling it. The old code cleared the timer and dropped it:
//   delete A, then delete B within 5s, and A silently came back.
export function useUndoDelete(defaultTable: string, onRefresh: () => void) {
  const [pendingDel, setPendingDelState] = useState<PendingDel | null>(null);
  // Ref mirrors the state so schedule/undo/dismiss read the CURRENT pending
  // entry, not the one their useCallback closed over.
  const pendingRef = useRef<PendingDel | null>(null);
  const setPending = (p: PendingDel | null) => { pendingRef.current = p; setPendingDelState(p); };

  const commit = useCallback(async (p: PendingDel) => {
    const { error } = await supabase.from(p.table).delete().eq('id', p.id);
    if (error) console.error('Delete failed:', error);
  }, []);

  const scheduleDelete = useCallback((id: string, label: string, table?: string) => {
    const prev = pendingRef.current;
    if (prev) { clearTimeout(prev.timer); commit(prev).then(onRefresh); }
    const entry: PendingDel = { id, label, table: table || defaultTable, timer: 0 };
    entry.timer = window.setTimeout(async () => {
      await commit(entry);
      setPending(null);
      onRefresh();
    }, 5000);
    setPending(entry);
  }, [defaultTable, onRefresh, commit]);

  const undo = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    setPending(null);
    onRefresh();
  }, [onRefresh]);

  const dismiss = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    commit(p).then(onRefresh);
    setPending(null);
  }, [onRefresh, commit]);

  return { pendingDel, scheduleDelete, undo, dismiss };
}
