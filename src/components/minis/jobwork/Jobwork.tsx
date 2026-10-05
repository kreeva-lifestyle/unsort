// Minis → Jobwork: work sourced outside the company. The list reads the
// jobwork_order_summary view (totals in SQL, paginated); a job opens as its
// own page (device Back returns here). New jobs from the header button on
// desktop and the FAB on the phone.
import { useState, useEffect, useCallback } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { useAuth } from '../../../hooks/useAuth';
import { useBackClose } from '../../../hooks/useBackClose';
import Empty from '../../ui/Empty';
import type { JobworkSummary } from '../../../types/database';
import JobCard from './JobCard';
import JobForm from './JobForm';
import JobDetailView from './JobDetailView';
import PendingShareModal from './PendingShareModal';
import { listJobs, FILTERS, type JobFilter } from './jobworkApi';

export default function Jobwork({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const boss = profile?.role === 'admin' || profile?.role === 'manager';
  const [rows, setRows] = useState<JobworkSummary[] | null>(null);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<JobFilter>('open');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState(false);
  useBackClose(!!openId, () => setOpenId(null));

  const load = useCallback(async () => {
    const r = await listJobs({ search, filter, page, perPage });
    if (r.error) { addToast(friendlyError(r.error), 'error'); setRows([]); return; }
    setRows(r.rows); setCount(r.count);
  }, [search, filter, page, perPage, addToast]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  if (openId) return <JobDetailView id={openId} onChanged={load} addToast={addToast} />;

  const pages = Math.max(1, Math.ceil(count / perPage));
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 14px', fontSize: 11, flexShrink: 0, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) });
  return (
    <div className="jw-list" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.tx }}>Jobwork</div>
          <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>What went out, what came back, what is pending and paid</div>
        </div>
        <button type="button" className="jw-share-btn" onClick={() => setSharing(true)} style={{ ...S.btnGhost, marginLeft: 'auto', minHeight: 36, flexShrink: 0 }}>Share pending</button>
        <button type="button" className="desktop-only" onClick={() => setCreating(true)} style={{ ...S.btnPrimary, height: 36 }}>+ New job</button>
      </div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search SKU, jobworker, job type or JW #" aria-label="Search jobs" style={{ ...S.fSearch, width: '100%' }} />
      </div>
      <div className="jw-filters" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
        {FILTERS.filter(f => boss || f.id !== 'unpaid').map(f => (
          <button key={f.id} type="button" onClick={() => { setFilter(f.id); setPage(0); }} aria-pressed={filter === f.id} style={chip(filter === f.id)}>{f.label}</button>
        ))}
      </div>

      {rows === null ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading jobs…</div>
        : rows.length === 0 ? (
          search || filter !== 'open'
            ? <Empty icon="search" title="No jobs match" message="Try another search or filter." />
            : <Empty icon="clipboard" title="No open jobs" message="Create a job when you give work to an outside jobworker — then record what you send and what comes back." cta="+ New job" onCta={() => setCreating(true)} />
        ) : rows.map(j => <JobCard key={j.id} job={j} showMoney={boss} onOpen={() => setOpenId(j.id)} />)}

      {count > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, opacity: page === 0 ? 0.3 : 1 }}>Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, opacity: page + 1 >= pages ? 0.3 : 1 }}>Next</button>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: T.tx3 }}>{count} job{count === 1 ? '' : 's'}</span>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} aria-label="Jobs per page"
            style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto' }}>
            {[10, 25, 50, 100].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      )}
      <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="New job">+</button>
      {sharing && <PendingShareModal boss={boss} onClose={() => setSharing(false)} addToast={addToast} />}
      {creating && <JobForm edit={null} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); load(); setOpenId(id); }} addToast={addToast} />}
    </div>
  );
}
