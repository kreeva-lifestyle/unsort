// Jobwork (sidebar, below Purchase Orders): work sourced outside the company. The list reads the
// jobwork_order_summary view (totals in SQL, paginated); a job opens as its
// own page (device Back returns here). New jobs from the header button on
// desktop and the FAB on the phone. Drafts (New job forms saved half-filled)
// have their own tab, shown while there are any.
import { useState, useEffect, useCallback, Suspense } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useProgressive } from '../../hooks/useProgressive';
import { useBackClose } from '../../hooks/useBackClose';
import Empty from '../ui/Empty';
import type { JobworkSummary } from '../../types/database';
import JobCard from './JobCard';
import JobTable from './JobTable';
import JobStats from './JobStats';
import { JobForm, JobDetailView, PendingShareModal, ReceivedByDate, prefetchJobworkParts } from './jobworkLazy';
import { whenIdle } from '../../lib/idle';
import { listJobs, tabCounts, tabOf, FILTERS, type JobFilter, type JobTab } from './jobworkApi';
import JobDrafts from './JobDrafts';
import { draftCount } from './jobworkDrafts';
import type { JobworkDraft } from '../../types/database';

export default function Jobwork({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const boss = profile?.role === 'admin' || profile?.role === 'manager';
  const phone = useIsPhone();
  const [rows, setRows] = useState<JobworkSummary[] | null>(null);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<JobFilter>('open');
  // One jobworker, from a tap on the summary's "Where the stock is" bar.
  const [vendor, setVendor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);
  // "Received on" (what came back on one date) — its own page, like a job.
  const [byDate, setByDate] = useState(false);
  const [counts, setCounts] = useState<Record<JobTab, number> | null>(null);
  const [creating, setCreating] = useState(false);
  // Drafts tab, the draft being finished, and a counter bumped after any draft change.
  const [onDrafts, setOnDrafts] = useState(false);
  const [draft, setDraft] = useState<JobworkDraft | null>(null);
  const [draftN, setDraftN] = useState<number | null>(null);
  const [draftVer, setDraftVer] = useState(0);
  const draftsChanged = useCallback(() => setDraftVer(v => v + 1), []);
  useEffect(() => { draftCount().then(setDraftN); }, [draftVer]);
  const [sharing, setSharing] = useState(false);
  // Bumped after every write so the summary tiles follow; a search or a
  // page flip changes nothing, so it leaves the summary alone.
  const [version, setVersion] = useState(0);
  useBackClose(!!openId, () => setOpenId(null));
  useBackClose(byDate && !openId, () => setByDate(false));

  const load = useCallback(async () => {
    const r = await listJobs({ search, filter, page, perPage, vendor });
    if (r.error) { addToast(friendlyError(r.error), 'error'); setRows([]); return; }
    setRows(r.rows); setCount(r.count);
    // Tab counts are a hint: a failure leaves them blank (the list already toasts its own errors).
    const c = await tabCounts({ search, vendor });
    setCounts(c.counts);
  }, [search, filter, page, perPage, vendor, addToast]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);
  const changed = useCallback(() => { load(); setVersion(v => v + 1); }, [load]);
  // The list first; the job page's and forms' code once it is on screen and the phone is idle.
  const listShown = rows !== null;
  const shownRows = useProgressive(rows ?? [], !listShown);
  useEffect(() => (listShown ? whenIdle(prefetchJobworkParts) : undefined), [listShown]);
  const wait = <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>;

  if (openId) return <Suspense fallback={wait}><JobDetailView id={openId} onBack={() => setOpenId(null)} onChanged={changed} addToast={addToast} /></Suspense>;
  if (byDate) return <Suspense fallback={wait}><ReceivedByDate onBack={() => setByDate(false)} onOpen={setOpenId} addToast={addToast} /></Suspense>;

  const pages = Math.max(1, Math.ceil(count / perPage));
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 14px', fontSize: 11, flexShrink: 0, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) });
  return (
    <div className="jw-list">
      {/* Same frame as Purchase Orders: the app header already names the page,
          so one quiet line + the actions, and the content uses the full width. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div style={{ fontSize: 12, color: T.tx3, minWidth: 0 }}>Work given outside · what went out, came back, is pending and paid</div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" className="jw-share-btn" onClick={() => setByDate(true)} style={S.btnGhost}>Received on…</button>
          <button type="button" className="jw-share-btn" onClick={() => setSharing(true)} style={S.btnGhost}>Share pending</button>
          <button type="button" className="desktop-only" onClick={() => setCreating(true)} style={S.btnPrimary}>+ New job</button>
        </div>
      </div>
      <JobStats boss={boss} version={version} active={filter} onPick={f => { setFilter(f); setPage(0); }}
        onVendor={v => { setVendor(v); setSearch(''); setFilter('open'); setPage(0); }} addToast={addToast} />
      {/* Open = running, or closed with money still owed; Completed = settled or cancelled. */}
      <div role="tablist" aria-label="Jobs" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['open', 'completed', ...(draftN || onDrafts ? ['drafts'] : [])] as (JobTab | 'drafts')[]).map(t => {
          const on = t === 'drafts' ? onDrafts : !onDrafts && tabOf(filter) === t;
          const n = t === 'drafts' ? draftN : counts?.[t];
          return (
            <button key={t} type="button" role="tab" aria-selected={on} onClick={() => { if (on) return; if (t === 'drafts') { setOnDrafts(true); return; } setOnDrafts(false); setFilter(t); setPage(0); }}
              style={{ ...(on ? S.btnPrimary : S.btnGhost), flex: 1, maxWidth: 220, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {t === 'open' ? 'Open' : t === 'completed' ? 'Completed' : 'Drafts'}
              {n != null && <span style={{ fontFamily: T.mono, fontSize: 11, padding: '1px 7px', borderRadius: 999, background: on ? 'rgba(255,255,255,.18)' : T.glass2, color: on ? T.tx : T.tx3 }}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="jw-toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search SKU, jobworker, job type or JW #" aria-label="Search jobs" style={{ ...S.fSearch, width: '100%' }} />
      </div>
      <div className="jw-filters" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {!onDrafts && tabOf(filter) === 'open' && FILTERS.filter(f => boss || f.id !== 'unpaid').map(f => (
          <button key={f.id} type="button" onClick={() => { setFilter(f.id); setPage(0); }} aria-pressed={filter === f.id} style={chip(filter === f.id)}>{f.label}</button>
        ))}
        {vendor && (
          <button type="button" onClick={() => { setVendor(null); setPage(0); }} aria-label={`Showing ${vendor} only — tap to show every jobworker`}
            style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 220 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor}</span><span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>&#215;</span>
          </button>
        )}
      </div>
      </div>

      {onDrafts ? <JobDrafts search={search} version={draftVer} onOpen={setDraft} addToast={addToast} />
        : rows === null ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading jobs…</div>
        : rows.length === 0 ? (
          search || vendor || filter === 'overdue' || filter === 'unpaid'
            ? <Empty icon="search" title="No jobs match" message="Try another search or filter." />
            : filter === 'completed'
            ? <Empty icon="clipboard" title="No completed jobs yet" message="A job moves here once everything is received and nothing is owed — paid in full or nothing to bill — or when it is cancelled." />
            : <Empty icon="clipboard" title="No open jobs" message="Create a job when you give work to an outside jobworker — then record what you send and what comes back." cta="+ New job" onCta={() => setCreating(true)} />
        ) : (<>
          {/* Only the layout on screen is built (the classes stay as the CSS fallback). */}
          {!phone && <JobTable rows={shownRows} showMoney={boss} onOpen={setOpenId} />}
          {phone && <div className="jw-cards">{shownRows.map(j => <JobCard key={j.id} job={j} showMoney={boss} onOpen={() => setOpenId(j.id)} />)}</div>}
        </>)}

      {!onDrafts && count > 0 && (
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
      <Suspense fallback={null}>
      {sharing && <PendingShareModal boss={boss} onClose={() => setSharing(false)} addToast={addToast} />}
      {creating && <JobForm edit={null} onClose={() => setCreating(false)} onSaved={id => { setCreating(false); changed(); setOpenId(id); }} onDrafts={draftsChanged} addToast={addToast} />}
      {draft && <JobForm key={draft.id} edit={null} draft={draft} onClose={() => setDraft(null)} onSaved={id => { setDraft(null); changed(); setOpenId(id); }} onDrafts={draftsChanged} addToast={addToast} />}
      </Suspense>
    </div>
  );
}
