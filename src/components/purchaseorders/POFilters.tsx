// The collapsible filter panel of the PO list (status, type, creator, date
// range, clear). Presentational — the parent owns every value.
import { S, T } from '../../lib/theme';
import DateInput from '../ui/DateInput';
import { PO_TYPE_LABELS, PO_STATUS_LABELS, PO_STATUSES } from '../../types/database';

export interface POFiltersProps {
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  typeFilter: string;
  onTypeFilterChange: (v: string) => void;
  creatorFilter: string;
  onCreatorFilterChange: (v: string) => void;
  users: { id: string; full_name: string }[];
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onClearFilters: () => void;
  onResetPage: () => void;
}

export default function POFilters(p: POFiltersProps & { filterActive: boolean }) {
  return (
    <div style={{ marginBottom: 8, padding: 14, background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div>
          <label style={S.fLabel}>Status</label>
          <select value={p.statusFilter} onChange={e => { p.onStatusFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
            <option value="">All</option>{PO_STATUSES.map(s => <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label style={S.fLabel}>Type</label>
          <select value={p.typeFilter} onChange={e => { p.onTypeFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
            <option value="">All</option>{(Object.keys(PO_TYPE_LABELS) as (keyof typeof PO_TYPE_LABELS)[]).map(t => <option key={t} value={t}>{PO_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={S.fLabel}>Created By</label>
          <select value={p.creatorFilter} onChange={e => { p.onCreatorFilterChange(e.target.value); p.onResetPage(); }} style={S.fInput}>
            <option value="">Anyone</option>{p.users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
        <div><label style={S.fLabel}>From</label><DateInput value={p.dateFrom} onChange={e => { p.onDateFromChange(e.target.value); p.onResetPage(); }} style={{ width: '100%' }} /></div>
        <div><label style={S.fLabel}>To</label><DateInput value={p.dateTo} onChange={e => { p.onDateToChange(e.target.value); p.onResetPage(); }} style={{ width: '100%' }} /></div>
      </div>
      {p.filterActive && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button onClick={p.onClearFilters} style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3, border: `1px solid ${T.bd2}`, background: T.glass1 }}>Clear filters</button></div>}
    </div>
  );
}
