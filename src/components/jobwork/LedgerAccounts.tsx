// Jobwork → Ledger, first screen: every jobworker as a card, the one owed
// the most first. Each card answers the owner's two questions in words —
// "You owe ₹24,636" (money, admin/manager only) and "89 pcs with Iqbar ·
// 3 open jobs" (pieces) — and opens that jobworker's statement.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import Empty from '../ui/Empty';
import { fmtDate, inr } from './jobworkModel';
import { owed, withThem, type WorkerAccount } from './jobworkLedger';

const toneColor: Record<string, string> = { yl: T.yl, bl: T.bl, gr: T.gr, tx3: T.tx3 };

export default function LedgerAccounts({ accounts, boss, onBack, onPick }: {
  accounts: WorkerAccount[] | null; boss: boolean; onBack: () => void; onPick: (key: string) => void;
}) {
  const [search, setSearch] = useState('');
  const list = (accounts ?? []).filter(a => !search || a.worker_name.toLowerCase().includes(search.toLowerCase()) || (a.worker_phone ?? '').includes(search));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobs</button>
        <span style={{ fontSize: 12, color: T.tx3 }}>{boss ? 'Who you owe, and what is still with each jobworker' : 'What is still with each jobworker'}</span>
      </div>
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: 12 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobworker or phone" aria-label="Search jobworkers" style={{ ...S.fSearch, width: '100%' }} />
      </div>
      {accounts === null ? <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : list.length === 0 ? <Empty icon="search" title={accounts.length ? 'No jobworker matches' : 'No jobworkers yet'} message={accounts.length ? 'Try another name.' : 'A jobworker appears here with their first job.'} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {list.map(a => {
              const o = owed(a.worker_name, a.due);
              return (
                <button key={a.worker_key} type="button" onClick={() => onPick(a.worker_key)} className="jw-row"
                  style={{ textAlign: 'left', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: 14, cursor: 'pointer', color: T.tx, font: 'inherit', minHeight: 44 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.worker_name}</div>
                  {boss && <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: toneColor[o.tone], marginTop: 6 }}>{o.short}</div>}
                  <div style={{ fontSize: 12, color: T.tx2, marginTop: boss ? 4 : 6 }}>{withThem(a.pending_pcs, a.pending_m, a.worker_name)} · {a.open_jobs} open job{a.open_jobs === 1 ? '' : 's'}</div>
                  {boss && a.billed > 0 && <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Billed {inr(a.billed)} · Paid {inr(a.paid)} all time</div>}
                  {a.last_activity && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Last activity {fmtDate(a.last_activity)}</div>}
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
