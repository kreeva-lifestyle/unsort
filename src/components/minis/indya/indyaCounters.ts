// The filter chips above Indya Import's result table: one per flag, with
// the count and the colour the flag carries elsewhere. Split out of
// IndyaImport.tsx to keep that file under the size limit.
import { T } from '../../../lib/theme';
import type { Counts, Flag } from './indyaCompute';

export type Filter = 'all' | Flag | 'shared' | 'unstitched' | 'stripped' | 'corrected' | 'lehenga';
export interface Counter { key: Filter; label: string; count: number; color: string }

export function counterChips(c: Counts): Counter[] {
  return [
    { key: 'all', label: 'Total', count: c.total, color: T.tx2 }, { key: 'ok', label: 'Updated', count: c.ok, color: T.gr }, { key: 'last', label: 'Last qty', count: c.last, color: T.yl },
    { key: 'unknown', label: 'Unknown code', count: c.unknown, color: T.re }, { key: 'size_missing', label: 'Size not stocked', count: c.size_missing, color: T.tx3 }, { key: 'oversize', label: 'Above XXL', count: c.oversize, color: T.tx3 },
    { key: 'oos', label: 'Out of stock', count: c.oos, color: T.re }, { key: 'shared', label: 'Shared code', count: c.shared, color: T.ac2 },
    { key: 'blocked', label: 'Blocked', count: c.blocked, color: T.or }, { key: 'unstitched', label: 'Unstitched', count: c.unstitched, color: T.tx3 },
    { key: 'stripped', label: 'Stripped', count: c.stripped, color: T.yl }, ...(c.lehenga ? [{ key: 'lehenga' as Filter, label: 'Lehenga', count: c.lehenga, color: T.gr }] : []), ...(c.corrected ? [{ key: 'corrected' as Filter, label: 'Corrected', count: c.corrected, color: T.bl }] : []),
  ];
}
