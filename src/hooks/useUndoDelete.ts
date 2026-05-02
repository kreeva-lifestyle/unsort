import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface PendingDel { id: string; label: string; timer: number }

export function useUndoDelete(table: string, onRefresh: () => void) {
  const [pendingDel, setPendingDel] = useState<PendingDel | null>(null);

  const scheduleDelete = useCallback((id: string, label: string) => {
    setPendingDel(prev => { if (prev) clearTimeout(prev.timer); return null; });
    const timer = window.setTimeout(async () => {
      await supabase.from(table).delete().eq('id', id);
      setPendingDel(null);
      onRefresh();
    }, 5000);
    setPendingDel({ id, label, timer });
  }, [table, onRefresh]);

  const undo = useCallback(() => {
    if (!pendingDel) return;
    clearTimeout(pendingDel.timer);
    setPendingDel(null);
    onRefresh();
  }, [pendingDel, onRefresh]);

  const dismiss = useCallback(() => {
    if (!pendingDel) return;
    clearTimeout(pendingDel.timer);
    supabase.from(table).delete().eq('id', pendingDel.id).then(({ error }) => { if (error) console.error('Delete failed:', error); onRefresh(); });
    setPendingDel(null);
  }, [pendingDel, table, onRefresh]);

  return { pendingDel, scheduleDelete, undo, dismiss };
}
