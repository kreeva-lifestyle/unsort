// One job: header + counts, the three floor actions (Receive · Send out ·
// Pay), material balance, the dated timeline, and Share / More sheets.
// Payments and corrections are admin/manager only (RLS enforces it; the
// buttons simply hide for everyone else).
import { useState, useEffect, useCallback } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import { useAuth } from '../../hooks/useAuth';
import ActionSheet from '../ui/ActionSheet';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import JobHeader from './JobHeader';
import JobBalance from './JobBalance';
import JobTimeline from './JobTimeline';
import EntryModal from './EntryModal';
import PaymentModal from './PaymentModal';
import CloseJobModal from './CloseJobModal';
import JobForm from './JobForm';
import { loadJob, costingImage, deleteEntry, deletePayment, setStatus } from './jobworkApi';
import { shareJob, shareVendor } from './jobworkShare';
import { materialBalances, inr, type JobDetail, type TimelineRow } from './jobworkModel';

type Sheet = null | 'out' | 'in' | 'pay' | 'close' | 'edit' | 'share' | 'more';

export default function JobDetailView({ id, onBack, onChanged, addToast }: {
  id: string;
  onBack: () => void;
  onChanged: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const boss = profile?.role === 'admin' || profile?.role === 'manager';
  const [d, setD] = useState<JobDetail | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState('');
  const { ask, modalProps } = useConfirm();

  const reload = useCallback(async () => {
    const { detail, error } = await loadJob(id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setD(detail);
  }, [id, addToast]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!d?.job.costing_product_id) { setPhoto(null); return; }
    costingImage(d.job.costing_product_id).then(r => { if (r.error) logSwallowed('jobwork photo', r.error); setPhoto(r.url); });
  }, [d?.job.costing_product_id]);

  const done = () => { setSheet(null); reload(); onChanged(); };
  if (!d) return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading job…</div>;
  const { job } = d, open = job.status === 'open';

  const share = async (what: 'job' | 'vendor', money: boolean) => {
    setSheet(null); setBusy('Sharing…');
    if (what === 'job') await shareJob(d, money, photo, addToast); else await shareVendor(job.vendor_name, money, addToast);
    setBusy('');
  };
  const removeRow = async (r: TimelineRow) => {
    const what = r.kind === 'pay' ? `the ${inr(r.pay.amount)} payment` : r.kind === 'in' ? 'this receipt' : 'this send-out';
    if (!(await ask({ title: `Delete ${what}?`, message: 'Use this only to fix a wrong entry. It is recorded in the audit log.', confirmLabel: 'Delete', danger: true }))) return;
    setBusy('Deleting…');
    const { error } = r.kind === 'pay' ? await deletePayment(r.pay.id) : await deleteEntry(r.entry.id);
    setBusy('');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Entry deleted', 'success'); done();
  };
  const status = async (to: 'open' | 'cancelled') => {
    setSheet(null);
    if (to === 'cancelled' && !(await ask({ title: `Cancel JW #${job.jw_number}?`, message: 'Only a job with nothing sent, received or paid can be cancelled.', confirmLabel: 'Cancel job', danger: true }))) return;
    setBusy(to === 'open' ? 'Reopening…' : 'Cancelling…');
    const { error } = await setStatus(job.id, to);
    setBusy('');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast(to === 'open' ? `JW #${job.jw_number} reopened` : `JW #${job.jw_number} cancelled`, 'success'); done();
  };

  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: 16, marginTop: 12 };
  const title = (s: string) => <div style={{ fontSize: 11, fontWeight: 700, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{s}</div>;
  const act = (label: string, onClick: () => void, primary = false, hidden = false) => hidden ? null : (
    <button type="button" onClick={onClick} style={{ ...(primary ? S.btnPrimary : S.btnGhost), minHeight: 44, flex: '1 1 0', pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{label}</button>
  );
  return (
    <div style={{ maxWidth: 860 }}>
      {/* The one back control on this page (device Back does the same). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={onBack} style={{ ...S.btnGhost, minHeight: 36 }}>‹ All jobs</button>
        {busy && <span style={{ fontSize: 11, color: T.tx3 }}>{busy}</span>}
      </div>
      <div style={{ ...card, marginTop: 0 }}><JobHeader job={job} photo={photo} /></div>
      <div className="jw-actions" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {act('Receive', () => setSheet('in'), true, !open)}
        {act('Send out', () => setSheet('out'), false, !open)}
        {act('Pay', () => setSheet('pay'), false, !boss || job.status === 'cancelled')}
        {act(busy === 'Sharing…' ? 'Sharing…' : 'Share', () => setSheet('share'))}
        {act('⋯ More', () => setSheet('more'))}
      </div>
      {job.close_reason && <div style={{ ...S.warningBox, marginTop: 12 }}>{job.status === 'cancelled' ? 'Cancelled' : 'Closed'}: {job.close_reason}</div>}
      <div style={card}>{title('Material')}<JobBalance rows={materialBalances(d, job.pcs_ok)} /></div>
      <div style={card}>{title('What moved, and when')}<JobTimeline detail={d} canFix={boss} onDelete={removeRow} /></div>
      {job.notes && <div style={card}>{title('Notes')}<div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{job.notes}</div></div>}

      <ActionSheet open={sheet === 'share'} title="Share statement" subtitle="Without money for the jobworker; with money for accounts" onClose={() => setSheet(null)} actions={[
        { label: 'This job — pieces & material', onClick: () => share('job', false) },
        ...(boss ? [{ label: 'This job — with rate, bill & payments', onClick: () => share('job', true) }] : []),
        { label: `All open jobs of ${job.vendor_name}`, onClick: () => share('vendor', false) },
        ...(boss ? [{ label: `All open jobs of ${job.vendor_name} — with dues`, onClick: () => share('vendor', true) }] : []),
      ]} />
      <ActionSheet open={sheet === 'more'} title={`JW #${job.jw_number}`} onClose={() => setSheet(null)} actions={[
        ...(open ? [{ label: 'Edit job', onClick: () => setSheet('edit') }, { label: 'Close job', onClick: () => setSheet('close') }] : []),
        ...(!open && boss ? [{ label: 'Reopen job', onClick: () => status('open') }] : []),
        ...(open && boss && job.out_count === 0 && job.pcs_ok + job.pcs_rejected === 0 && Number(job.paid) === 0 ? [{ label: 'Cancel job', onClick: () => status('cancelled'), danger: true }] : []),
      ]} />
      {(sheet === 'out' || sheet === 'in') && <EntryModal kind={sheet} detail={d} onClose={() => setSheet(null)} onSaved={done} addToast={addToast} />}
      {sheet === 'pay' && <PaymentModal job={job} onClose={() => setSheet(null)} onSaved={done} addToast={addToast} />}
      {sheet === 'close' && <CloseJobModal job={job} onClose={() => setSheet(null)} onSaved={done} addToast={addToast} />}
      {sheet === 'edit' && <JobForm edit={d} onClose={() => setSheet(null)} onSaved={done} addToast={addToast} />}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
