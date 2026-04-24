import { useEffect, useRef, useCallback } from 'react';

// Debounced fetch for realtime listeners. Coalesces rapid UPDATE events
// (e.g. during bulk operations) into a single refetch after `waitMs`.
// INSERT/DELETE should call the immediate `fetchFn` directly — only wire
// this to UPDATE events. Pending timer is cleared on unmount.
//
// Stale data safety: writes are protected by DB-level optimistic concurrency
// (updated_at check) and query-time WHERE filters, so a 500ms read lag
// cannot cause a bad write. Use `flush()` before critical writes to
// force-sync state.
export function useDebouncedFetch(fetchFn: () => void, waitMs: number = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fetchFn);
  useEffect(() => { fnRef.current = fetchFn; }, [fetchFn]);

  const debounced = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; fnRef.current(); }, waitMs);
  }, [waitMs]);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await fnRef.current();
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { debounced, flush };
}
