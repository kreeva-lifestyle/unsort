// Bulk pay sheet (owner, 2026-11-17): one jobworker's jobs that still have a
// balance, all ticked, with the total. Untick any to leave it out; one date,
// mode, reference and note go on every payment. Each ticked job is paid its
// balance in one save (jobworkBulkPay.ts: all or nothing, and nothing at all
// if a balance changed since the sheet opened). Admin/manager only — RLS on
// jobwork_payments enforces it; the button is shown to them alone.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import DateInput from '../ui/DateInput';
import { JOBWORK_PAY_MODES, type JobworkPayMode } from '../../types/database';
import { owedJobs, payJobs, totalOf, type OwedJob } from './jobworkBulkPay';
import { today, inr, shortDate, PAY_MODE_LABELS } from './jobworkModel';

export default function BulkPayModal({ vendor, onClose, onPaid, addToast }: {
  vendor: string;
  onClose: () => void;
  onPaid: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  // null while loading; the jobs, and which are ticked (all, to start).
  const [jobs, setJobs] = useState<OwedJob[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<JobworkPayMode>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setJobs(null); setError(''); setLoadFailed(false);
    const r = await owedJobs(vendor);
    if (r.error) { setError(friendlyError(r.error)); setLoadFailed(true); setJobs([]); return; }
    setJobs(r.jobs); setOff(new Set());
  }, [vendor]);
  useEffect(() => { load(); }, [load]);

  const picked = (jobs ?? []).filter(j => !off.has(j.id));
  const total = totalOf(picked);
  const toggle = (id: string) => { setError(''); setOff(s => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; }); };
  const allOn = !!jobs && off.size === 0;

  const submit = async () => {
    if (saving || !jobs) return;
    if (!picked.length) return setError('Tick at least one job to pay.');
    setSaving(true); setError('');
    const r = await payJobs(vendor, picked, { pay_date: date || today(), mode, reference: reference.trim() || null, note: note.trim() || null });
    setSaving(false);
    if (r.changed) { await load(); setError('A balance changed since this opened (a payment or a receipt). The list is up to date now — check it and pay again.'); return; }
    if (r.error) { setError(friendlyError(r.error)); return; }
    addToast(`${inr(total)} paid to ${vendor} on ${picked.length} job${picked.length === 1 ? '' : 's'}`, 'success');
    onPaid();
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };

  return createPortal(
    <div style={S.modalOverlay}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 520, display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={S.modalTitle}>Bulk pay</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {vendor}{jobs && !loadFailed ? ` · ${jobs.length} job${jobs.length === 1 ? '' : 's'} with a balance` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 0 }}>
          {jobs === null ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading their jobs…</div>
            : jobs.length === 0 ? (
              <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: T.tx3 }}>
                {loadFailed ? <button type="button" onClick={load} style={{ ...S.btnGhost, minHeight: 44 }}>Try again</button> : `Nothing is owed to ${vendor} right now.`}
              </div>
            ) : (<>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={S.fLabel}>Jobs · {picked.length} of {jobs.length} ticked</span>
                <button type="button" className="touch44" onClick={() => { setError(''); setOff(allOn ? new Set(jobs.map(j => j.id)) : new Set()); }}
                  style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32 }}>{allOn ? 'Untick all' : 'Tick all'}</button>
              </div>
              {/* Its own scroll past ~7 jobs, so the total and Pay stay in reach on a phone. */}
              <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, overflowY: 'auto', flexShrink: 0, maxHeight: 'min(44vh, 400px)', WebkitOverflowScrolling: 'touch' }}>
                {jobs.map((j, i) => {
                  const on = !off.has(j.id);
                  return (
                    <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 12px', cursor: 'pointer', borderTop: i ? `1px solid ${T.bd}` : 'none', background: on ? T.glass1 : 'transparent' }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(j.id)} style={{ width: 18, height: 18, accentColor: T.ac, flexShrink: 0 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: on ? T.tx : T.tx3 }}>{j.sku}</span>
                          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3 }}>JW #{j.jw_number}</span>
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: T.tx3, marginTop: 2 }}>{j.job_type}{j.component ? ` · ${j.component.toUpperCase()}` : ''} · {shortDate(j.job_date)}</span>
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: 13, color: on ? T.tx : T.tx3, textDecoration: on ? 'none' : 'line-through', whiteSpace: 'nowrap' }}>{inr(j.due)}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '2px 2px 0' }}>
                <span style={{ fontSize: 12, color: T.tx2 }}>Total to pay</span>
                <span style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: total > 0 ? T.tx : T.tx3 }}>{inr(total)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                <div><label style={S.fLabel}>Date</label><DateInput value={date} max={today()} onChange={e => setDate(e.target.value)} style={{ width: '100%', height: 44 }} /></div>
                <div>
                  <label style={S.fLabel}>Mode</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {JOBWORK_PAY_MODES.map(m => (
                      <button key={m} type="button" className="touch44" onClick={() => setMode(m)} aria-pressed={mode === m}
                        style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, borderRadius: 999, padding: '6px 12px', fontSize: 11, ...(mode === m ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) }}>{PAY_MODE_LABELS[m]}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={S.fLabel}>Reference</label><input value={reference} onChange={e => setReference(e.target.value)} onKeyDown={enter} placeholder="UTR / cheque no." style={{ ...S.fInput, width: '100%', height: 44 }} /></div>
                <div><label style={S.fLabel}>Note</label><input value={note} onChange={e => setNote(e.target.value)} onKeyDown={enter} placeholder="optional" style={{ ...S.fInput, width: '100%', height: 44 }} /></div>
              </div>
              <div style={{ fontSize: 11, color: T.tx3 }}>Each ticked job is paid its balance, recorded on the job as its own payment.</div>
            </>)}
          {error && <div role="alert" style={S.errorBox}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            {!!jobs?.length && (
              <button type="button" onClick={submit} disabled={!picked.length}
                style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving || !picked.length ? 'none' : 'auto', opacity: saving || !picked.length ? 0.5 : 1 }}>
                {saving ? 'Paying…' : `Pay ${inr(total)}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
