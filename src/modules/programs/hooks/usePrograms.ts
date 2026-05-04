// Programs list + search + realtime subscription hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchPrograms, fetchMatchingCounts, fetchPriceSummaries } from '../lib/supabase-rpc';
import type { Program } from '../types';

export function usePrograms() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [matchingCounts, setMatchingCounts] = useState<Record<string, number>>({});
  const [priceSummaries, setPriceSummaries] = useState<Record<string, { workTotal: number; fabricMeter: number }>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (s?: string) => {
    setLoading(true);
    const { data, count } = await fetchPrograms({ search: s ?? search, page, pageSize });
    setPrograms(data);
    setTotalCount(count);
    setLoading(false);
    // Load summaries in background — table shows immediately
    const ids = data.map(p => p.id);
    if (ids.length > 0) {
      Promise.all([fetchMatchingCounts(ids), fetchPriceSummaries(ids)]).then(([counts, summaries]) => {
        setMatchingCounts(counts);
        setPriceSummaries(summaries);
      });
    }
  }, [search, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  const onSearch = useCallback((q: string) => {
    setSearch(q);
    setPage(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q), 300);
  }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('programs-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'programs' }, () => load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'programs' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'programs' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => load(), 500);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  return { programs, matchingCounts, priceSummaries, loading, search, onSearch, page, setPage, pageSize, setPageSize, totalCount, reload: load };
}
