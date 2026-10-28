// Jobwork → Ledger: every jobworker's running account, built on the research
// in reports/Jobworker ledger made understandable.md. First the jobworkers
// (LedgerAccounts), then one jobworker's statement: a header that says the
// position in words (LedgerHeader), a Jobs tab of per-job cards
// (LedgerJobs), a Money tab timeline with Billed / Paid columns and a
// running balance (LedgerRows), and an A4 statement (ledgerPdf). A line or
// card opens its job; which account, tab, period and filter are on screen
// is kept by the Jobwork page so Back returns here. Money is admin/manager
// only; others see the pieces side of everything.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useBackClose } from '../../hooks/useBackClose';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { printOrQueue } from '../../lib/printQueue';
import PrintPreview from '../ui/PrintPreview';
import { workerAccounts, workerLedger, periodOf, LEDGER_CAP, type WorkerAccount, type Ledger, type Period, type LedgerView } from './jobworkLedger';
import { buildLedgerPdf } from './ledgerPdf';
import LedgerAccounts from './LedgerAccounts';
import LedgerHeader from './LedgerHeader';
import LedgerJobs from './LedgerJobs';
import LedgerRows from './LedgerRows';

export default function JobworkerLedger({ view, onView, onBack, onOpen, addToast }: {
  view: LedgerView; onView: (v: LedgerView) => void;
  onBack: () => void; onOpen: (orderId: string) => void; addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const boss = profile?.role === 'admin' || profile?.role === 'manager';
  const [accounts, setAccounts] = useState<WorkerAccount[] | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [pdf, setPdf] = useState(false);
  const [printing, setPrinting] = useState('');
  useBackClose(!!view.key, () => onView({ ...view, key: null }));

  useEffect(() => {
    workerAccounts().then(r => { if (r.error) addToast(friendlyError(r.error), 'error'); setAccounts(r.rows); });
  }, [addToast]);
  // The Jobs tab and the header always read the whole account; the period only narrows the Money tab.
  const period: Period = useMemo(() => (view.tab === 'money' ? (view.pid === 'custom' ? view.custom : periodOf(view.pid)) : { from: null, to: null }), [view.tab, view.pid, view.custom]);
  useEffect(() => {
    if (!view.key) return;
    let live = true;
    setLedger(null);
    workerLedger(view.key, period).then(r => {
      if (!live) return;
      if (r.error) addToast(friendlyError(r.error), 'error');
      setLedger(r.ledger ?? { opening: 0, work: 0, paid: 0, closing: 0, count: 0, month_work: 0, month_paid: 0, oldest_open: null, jobs: [], rows: [] });
    });
    return () => { live = false; };
  }, [view.key, period, addToast]);

  const account = accounts?.find(a => a.worker_key === view.key) ?? null;
  const html = useMemo(() => (pdf && account && ledger ? buildLedgerPdf({ account, period, ledger, money: boss }) : ''), [pdf, account, ledger, period, boss]);

  if (!view.key || !account) return <LedgerAccounts accounts={accounts} boss={boss} onBack={onBack} onPick={k => onView({ ...view, key: k })} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => onView({ ...view, key: null })} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobworkers</button>
      </div>
      <LedgerHeader account={account} ledger={ledger} boss={boss} view={view} onView={onView} onPrint={() => setPdf(true)} />
      {!ledger ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : view.tab === 'jobs' ? <LedgerJobs jobs={ledger.jobs} boss={boss} onOpen={onOpen} />
        : <>
          {ledger.rows.length < ledger.count && <div style={{ fontSize: 11, color: T.yl, marginBottom: 8 }}>First {LEDGER_CAP} of {ledger.count} lines shown — pick a shorter period for the rest.</div>}
          <LedgerRows rows={ledger.rows} boss={boss} name={account.worker_name} opening={ledger.opening} hasFrom={!!period.from} filter={view.filter} onFilter={f => onView({ ...view, filter: f })} onOpen={onOpen} />
        </>}
      {pdf && html && (
        <PrintPreview title={`Statement — ${account.worker_name}`} html={html} busy={printing} printLabel="Print / Save PDF" onClose={() => setPdf(false)}
          onPrint={async frame => { setPrinting('Printing…'); await printOrQueue('document', html, 'A4', `Statement ${account.worker_name}`, undefined, addToast, frame); setPrinting(''); }} />
      )}
    </div>
  );
}
