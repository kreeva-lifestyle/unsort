// Settings → Problem reports (admin): everything staff reported with
// "Report a problem", what the scheduled Claude Code check found and the fix
// it prepared. A fix goes live only when an admin taps Approve here; the next
// check (twice a day) merges and deploys it and tells the reporter.
import { useCallback, useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import { SkeletonRows } from '../ui/Skeleton';
import { KINDS, STATUS_LABEL, allReports, decide, screenshotUrl, type IssueReport } from '../feedback/reportApi';

const PAGE = 25;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const tone = (s: IssueReport['status']) => (s === 'fixed' ? T.gr : s === 'fix_ready' ? T.yl : s === 'approved' ? T.bl : T.tx3);

function ReportRow({ r, onDone, addToast }: { r: IssueReport; onDone: () => void; addToast: (m: string, t?: string) => void }) {
  const [busy, setBusy] = useState<'' | 'approved' | 'declined'>('');
  const [note, setNote] = useState('');
  const [shot, setShot] = useState('');
  const act = async (status: 'approved' | 'declined') => {
    if (busy) return;
    setBusy(status);
    try { await decide(r.id, status, note); addToast(status === 'approved' ? 'Approved — it goes live at the next check' : 'Fix declined', 'success'); onDone(); }
    catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setBusy(''); }
  };
  const openShot = async () => {
    if (shot) { setShot(''); return; }
    try { setShot(await screenshotUrl(r.screenshot_path as string)); }
    catch (e) { addToast(friendlyError(e), 'error'); }
  };
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 10, fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: T.tx, fontWeight: 600 }}>{KINDS.find(k => k.id === r.kind)?.label} · {r.page}</span>
        <span style={{ color: T.tx3 }}>{r.reporter_name || 'Someone'} · {when(r.created_at)}</span>
      </div>
      {r.note && <div style={{ color: T.tx2, marginTop: 4 }}>“{r.note}”</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: tone(r.status), fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone(r.status) }} />{STATUS_LABEL[r.status]}
      </div>
      {r.summary && <div style={{ color: T.tx2, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.summary}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {r.pr_url && /^https:\/\/github\.com\//.test(r.pr_url) && <a href={r.pr_url} target="_blank" rel="noopener noreferrer" style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>See the change</a>}
        {r.screenshot_path && <button type="button" onClick={openShot} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>{shot ? 'Hide screenshot' : 'Screenshot'}</button>}
      </div>
      {shot && <img src={shot} alt="Screenshot sent with the report" style={{ display: 'block', maxWidth: '100%', maxHeight: 480, marginTop: 8, borderRadius: 8, border: `1px solid ${T.bd}` }} />}
      {r.status === 'fix_ready' && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note for the fix (optional, e.g. why declined)" style={{ ...S.fInput, width: '100%' }} aria-label="Note" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => act('declined')} style={{ ...S.btnDanger, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy === 'declined' ? 'Declining…' : 'Decline'}</button>
          <button type="button" onClick={() => act('approved')} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy === 'approved' ? 'Approving…' : 'Approve — make it live'}</button>
        </div>
      </div>}
      {r.admin_note && <div style={{ color: T.tx3, marginTop: 6 }}>Your note: {r.admin_note}</div>}
    </div>
  );
}

export default function ProblemReports({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [open, setOpen] = useState(true);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: IssueReport[]; total: number } | null>(null);
  const load = useCallback(() => {
    allReports(open, page, PAGE).then(setData).catch(e => { addToast(friendlyError(e), 'error'); setData({ rows: [], total: 0 }); });
  }, [open, page, addToast]);
  useEffect(() => { setData(null); load(); }, [load]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE));
  const waiting = data?.rows.filter(r => r.status === 'fix_ready').length || 0;

  return (
    <div>
      <div style={{ fontSize: 12, color: T.tx3, lineHeight: 1.5, marginBottom: 10 }}>Staff report problems with the flag button at the top of every screen. Twice a day Claude checks new reports and prepares fixes. Nothing changes in the app until you tap <b style={{ color: T.tx2 }}>Approve</b>; the next check then makes it live and tells the person who reported it.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[true, false].map(o => (
          <button key={String(o)} type="button" onClick={() => { setOpen(o); setPage(0); }} style={{ minHeight: 40, padding: '6px 14px', borderRadius: 8, border: `1px solid ${open === o ? T.ac : T.bd}`, background: open === o ? T.ac3 : 'transparent', color: open === o ? T.ac2 : T.tx2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {o ? `Open${open && waiting ? ` · ${waiting} to approve` : ''}` : 'Done'}
          </button>
        ))}
      </div>
      {!data ? <SkeletonRows rows={3} />
        : !data.rows.length ? <Empty icon="clipboard" title={open ? 'Nothing open' : 'Nothing finished yet'} message={open ? 'No problems are waiting. New reports appear here as staff send them.' : 'Fixed and closed reports appear here.'} />
        : data.rows.map(r => <ReportRow key={r.id} r={r} onDone={load} addToast={addToast} />)}
      {data && data.total > PAGE && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</button>
        <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
        <button type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= pages - 1 ? 0.3 : 1, pointerEvents: page >= pages - 1 ? 'none' : 'auto' }}>Next</button>
      </div>}
    </div>
  );
}
