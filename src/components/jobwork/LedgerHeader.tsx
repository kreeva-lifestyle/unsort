// The top of one jobworker's statement: two sentences — the money position
// in the owner's voice ("You owe Iqbar ₹24,636", "Settled — nothing owed")
// and the pieces position ("89 pcs with Iqbar · 3 open jobs · oldest 14
// days") — then two light chips for this month, set apart from the balance
// so a period total is never read as the balance.
import { T, S } from '../../lib/theme';
import DateInput from '../ui/DateInput';
import { inr, today } from './jobworkModel';
import { owed, withThem, daysSince, periodOf, PERIODS, type WorkerAccount, type Ledger, type LedgerView } from './jobworkLedger';

const toneColor: Record<string, string> = { yl: T.yl, bl: T.bl, gr: T.gr, tx3: T.tx3 };

export default function LedgerHeader({ account, ledger, boss, view, onView, onPrint }: {
  account: WorkerAccount; ledger: Ledger | null; boss: boolean; view: LedgerView; onView: (v: LedgerView) => void; onPrint: () => void;
}) {
  const o = owed(account.worker_name, account.due);
  const age = ledger?.oldest_open ? daysSince(ledger.oldest_open) : 0;
  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 36, borderRadius: 999, padding: '5px 14px', fontSize: 11, flexShrink: 0, ...(on ? { border: `1px solid ${T.ac}`, color: T.ac2, background: T.ac3 } : {}) });
  const canPrint = !!ledger && (ledger.rows.length > 0 || ledger.jobs.length > 0);
  return (
    <div>
      <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>{account.worker_name}</span>
          {account.worker_phone && <a href={`tel:${account.worker_phone}`} style={{ fontSize: 12, color: T.ac2, fontFamily: T.mono }}>{account.worker_phone}</a>}
          <button type="button" onClick={onPrint} disabled={!canPrint} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, marginLeft: 'auto', opacity: canPrint ? 1 : 0.4, pointerEvents: canPrint ? 'auto' : 'none' }}>Statement PDF</button>
        </div>
        {boss && <div style={{ fontSize: 20, fontWeight: 800, fontFamily: T.sora, color: toneColor[o.tone], marginTop: 8 }}>{o.text}</div>}
        <div style={{ fontSize: 13, color: T.tx2, marginTop: boss ? 4 : 8 }}>
          {withThem(account.pending_pcs, account.pending_m, account.worker_name)} · {account.open_jobs} open job{account.open_jobs === 1 ? '' : 's'}{age > 0 ? ` · oldest ${age} day${age === 1 ? '' : 's'}` : ''}
        </div>
        {boss && ledger && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {[['Billed this month', ledger.month_work], ['Paid this month', ledger.month_paid]].map(([l, v]) => (
              <span key={String(l)} style={{ fontSize: 11, color: T.tx3, padding: '4px 10px', border: `1px solid ${T.bd}`, borderRadius: 999, background: 'rgba(255,255,255,0.02)' }}>{l} <b style={{ color: T.tx2, fontFamily: T.mono }}>{inr(v)}</b></span>
            ))}
          </div>
        )}
      </div>
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['jobs', 'money'] as const).map(t => (
          <button key={t} type="button" role="tab" aria-selected={view.tab === t} onClick={() => onView({ ...view, tab: t })}
            style={{ ...(view.tab === t ? S.btnPrimary : S.btnGhost), flex: 1, maxWidth: 200, minHeight: 44 }}>{t === 'jobs' ? 'Jobs' : boss ? 'Money' : 'Timeline'}</button>
        ))}
      </div>
      {view.tab === 'money' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {PERIODS.map(p => <button key={p.id} type="button" aria-pressed={view.pid === p.id} onClick={() => onView({ ...view, pid: p.id })} style={chip(view.pid === p.id)}>{p.label}</button>)}
          <button type="button" aria-pressed={view.pid === 'custom'} onClick={() => onView({ ...view, pid: 'custom', custom: view.custom.from || view.custom.to ? view.custom : periodOf('month') })} style={chip(view.pid === 'custom')}>Dates…</button>
          {view.pid === 'custom' && <>
            <DateInput value={view.custom.from ?? ''} max={view.custom.to ?? today()} onChange={e => onView({ ...view, custom: { ...view.custom, from: e.target.value || null } })} aria-label="From" style={{ width: 150 }} />
            <span style={{ fontSize: 11, color: T.tx3 }}>to</span>
            <DateInput value={view.custom.to ?? ''} min={view.custom.from ?? undefined} max={today()} onChange={e => onView({ ...view, custom: { ...view.custom, to: e.target.value || null } })} aria-label="To" style={{ width: 150 }} />
          </>}
        </div>
      )}
    </div>
  );
}
