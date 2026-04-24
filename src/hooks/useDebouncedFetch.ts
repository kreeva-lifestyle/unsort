import { useEffect, useRef, useCallback } from 'react';

export function useDebouncedFetch(fetchFn: () => void, waitMs: number = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fetchFn);
  const mountedRef = useRef(true);
  useEffect(() => { fnRef.current = fetchFn; }, [fetchFn]);

  const debounced = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current) return;
      try { fnRef.current(); } catch { /* fetchFn handles its own errors */ }
    }, waitMs);
  }, [waitMs]);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try { await fnRef.current(); } catch { /* fetchFn handles its own errors */ }
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { debounced, flush };
}
