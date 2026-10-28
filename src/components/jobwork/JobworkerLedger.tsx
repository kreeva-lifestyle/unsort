// Jobwork → Ledger: every jobworker's running account. First a list of
// jobworkers (what is due to each, open jobs, pieces still with them —
// largest balance first); tapping one opens their statement: period chips
// (All time / This month / Last month / This FY / custom dates), opening
// balance, every dated line across all their jobs with a running balance,
// and Print / Save PDF. A line opens its job. Money is admin/manager only,
// like the rest of Jobwork; others see the pieces trail.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useBackClose } from '../../hooks/useBackClose';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { printOrQueue } from '../../lib/printQueue';
import DateInput from '../ui/DateInput';
import Empty from '../ui/Empty';
import PrintPreview from '../ui/PrintPreview';
import { inr, qty, fmtDate, today } from './jobworkModel';
import { workerAccounts, workerLedger, periodOf, PERIODS, LEDGER_CAP, balanceWords, type WorkerAccount, type Ledger, type PeriodId, type Period, type LedgerView } from './jobworkLedger';
import { buildLedgerPdf } from './ledgerPdf';
import LedgerRows from './LedgerRows';

const pendingText = (a: WorkerAccount) => [a.pending_pcs ? `${qty(a.pending_pcs)} pcs` : '', a.pending_m ? `${qty(a.pending_m)} m` : ''].filter(Boolean).join(' + ');

export default function JobworkerLedger({ view, onView, onBack, onOpen, addToast }: {
  view: LedgerView; onView: (v: LedgerView) => void;
  onBack: () => void; onOpen: (orderId: string) => void; addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const boss = profile?.role === 'admin' || profile?.role === 'manager';
  const [accounts, setAccounts] = useState<WorkerAccount[] | null>(null);
  const [search, setSearch] = useState('');
  const { key, pid, custom } = view;
  const setKey = (k: string | null) => onView({ ...view, key: k });
  const setPid = (p: PeriodId) => onView({ ...view, pid: p });
  const setCustom = (c: Period) => onView({ ...view, pid: 'custom', custom: c });
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [pdf, setPdf] = useState(false);
  const [printing, setPrinting] = useState('');
  useBackClose(!!key, () => setKey(null));

  useEffect(() => {
    workerAccounts().then(r => { if (r.error) addToast(friendlyError(r.error), 'error'); setAccounts(r.rows); });
  }, [addToast]);
  const period: Period = useMemo(() => (pid === 'custom' ? custom : periodOf(pid)), [pid, custom]);
  useEffect(() => {
    if (!key) return;
    let live = true;
    setLedger(null);
    workerLedger(key, period).then(r => {
      if (!live) return;
      if (r.error) addToast(friendlyError(r.error), 'error');
      setLedger(r.ledger ?? { opening: 0, work: 0, paid: 0, closing: 0, count: 0, rows: [] });
    });
    return () => { live = false; };
  }, [key, period, addToast]);

  const account = accounts?.find(a => a.worker_key === key) ?? null;
  const list = (accounts ?? []).filter(a => !search || a.worker_name.toLowerCase().includes(search.toLowerCase()) || (a.worker_phone ?? '').includes(search));
  const html = useMemo(() => (pdf && account && ledger ? buildLedgerPdf({ account, period, ledger, money: boss }) : ''), [pdf, account, ledger, period, boss]);
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 36, borderRadius: 999, padding: '5px 14px', fontSize: 11, flexShrink: 0, ...(on ? { border: `1px solid ${T.ac}`, color: T.ac2, background: T.ac3 } : {}) });   // whole `border`, not borderColor: React warns when a shorthand and its part swap on rerender
  const tile = (label: string, value: string, tone?: string) => (
    <div style={{ flex: '1 1 130px', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.mono, color: tone ?? T.tx, marginTop: 4 }}>{value}</div>
    </div>
  );

  if (key && account) return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setKey(null)} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobworkers</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{account.worker_name}</span>
        {account.worker_phone && <a href={`tel:${account.worker_phone}`} style={{ fontSize: 12, color: T.ac2, fontFamily: T.mono }}>{account.worker_phone}</a>}
        <button type="button" onClick={() => setPdf(true)} disabled={!ledger?.rows.length}
          style={{ ...S.btnPrimary, minHeight: 44, marginLeft: 'auto', opacity: ledger?.rows.length ? 1 : 0.4, pointerEvents: ledger?.rows.length ? 'auto' : 'none' }}>Print / PDF</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {PERIODS.map(p => <button key={p.id} type="button" aria-pressed={pid === p.id} onClick={() => setPid(p.id)} style={chip(pid === p.id)}>{p.label}</button>)}
        <button type="button" aria-pressed={pid === 'custom'} onClick={() => setCustom(custom.from || custom.to ? custom : periodOf('month'))} style={chip(pid === 'custom')}>Dates…</button>
        {pid === 'custom' && <>
          <DateInput value={custom.from ?? ''} max={custom.to ?? today()} onChange={e => setCustom({ ...custom, from: e.target.value || null })} aria-label="From" style={{ width: 150 }} />
          <span style={{ fontSize: 11, color: T.tx3 }}>to</span>
          <DateInput value={custom.to ?? ''} min={custom.from ?? undefined} max={today()} onChange={e => setCustom({ ...custom, to: e.target.value || null })} aria-label="To" style={{ width: 150 }} />
        </>}
      </div>
      {boss && ledger && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {period.from && tile(`Opening ${fmtDate(period.from)}`, inr(ledger.opening))}
          {tile('Work done', inr(ledger.work))}
          {tile('Paid', inr(ledger.paid), T.gr)}
          {tile('Balance', balanceWords(ledger.closing), ledger.closing > 0.005 ? T.yl : T.tx2)}
        </div>
      )}
      <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>
        {account.open_jobs} open job{account.open_jobs === 1 ? '' : 's'}{pendingText(account) ? ` · ${pendingText(account)} still with ${account.worker_name}` : ''}
        {ledger && ledger.rows.length < ledger.count ? ` · first ${LEDGER_CAP} of ${ledger.count} lines shown — pick a shorter period` : ''}
      </div>
      {!ledger ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : ledger.rows.length === 0 ? <Empty icon="receipt" title="Nothing in this period" message="Pick another period, or All time." />
        : <LedgerRows rows={ledger.rows} boss={boss} opening={ledger.opening} hasFrom={!!period.from} onOpen={onOpen} />}
      {pdf && html && (
        <PrintPreview title={`Ledger — ${account.worker_name}`} html={html} busy={printing} printLabel="Print / Save PDF" onClose={() => setPdf(false)}
          onPrint={async frame => { setPrinting('Printing…'); await printOrQueue('document', html, 'A4', `Ledger ${account.worker_name}`, undefined, addToast, frame); setPrinting(''); }} />
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobs</button>
        <span style={{ fontSize: 12, color: T.tx3 }}>Each jobworker's account — work given, received, paid and the balance</span>
      </div>
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: 12 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobworker or phone" aria-label="Search jobworkers" style={{ ...S.fSearch, width: '100%' }} />
      </div>
      {accounts === null ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : list.length === 0 ? <Empty icon="search" title={accounts.length ? 'No jobworker matches' : 'No jobworkers yet'} message={accounts.length ? 'Try another name.' : 'A jobworker appears here with their first job.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {list.map(a => (
              <button key={a.worker_key} type="button" onClick={() => setKey(a.worker_key)} className="jw-row"
                style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: 14, cursor: 'pointer', color: T.tx, font: 'inherit', minHeight: 44 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.worker_name}</span>
                  {boss && <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: a.due > 0.005 ? T.yl : T.tx3, flexShrink: 0 }}>{balanceWords(a.due)}</span>}
                </div>
                <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>
                  {a.open_jobs} open of {a.jobs} job{a.jobs === 1 ? '' : 's'}{pendingText(a) ? ` · ${pendingText(a)} with them` : ''}
                </div>
                {boss && <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, fontFamily: T.mono }}>Work {inr(a.billed)} · Paid {inr(a.paid)}</div>}
                {a.last_activity && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Last activity {fmtDate(a.last_activity)}</div>}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
