// The job form's buttons, and the draft saving behind them. A new job:
// Cancel · Save as draft · Create job. A saved draft: Discard draft (asks
// first) · Save draft · Create job. Editing a job: Cancel · Save changes.
import { S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import type { JobworkDraftForm } from '../../types/database';
import { saveDraft, deleteDraft, hasContent } from './jobworkDrafts';

export type Busy = '' | 'job' | 'draft' | 'discard';

export default function JobFormActions({ mode, draftId, form, busy, setBusy, setError, onCancel, onDrafts, onSubmit, addToast }: {
  mode: 'new' | 'draft' | 'edit';
  draftId: string | null;
  form: () => JobworkDraftForm;
  busy: Busy; setBusy: (b: Busy) => void; setError: (e: string) => void;
  onCancel: () => void;
  /** A draft was saved or discarded: refresh the drafts and close the form. */
  onDrafts: () => void;
  onSubmit: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { ask, modalProps } = useConfirm();
  const fail = (err: unknown) => { setBusy(''); setError(friendlyError(err)); addToast(friendlyError(err), 'error'); };
  const keep = async () => {
    if (busy) return;
    const f = form();
    if (!hasContent(f)) { setError('Fill in at least the jobworker or the SKU to save a draft'); return; }
    setBusy('draft');
    const { error } = await saveDraft(draftId, f);
    if (error) return fail(error);
    setBusy(''); addToast('Draft saved — finish it from the Drafts tab', 'success'); onDrafts();
  };
  const discard = async () => {
    if (busy || !draftId) return;
    if (!await ask({ title: 'Discard this draft?', message: 'The draft is removed for everyone. No job is affected.', confirmLabel: 'Discard', danger: true })) return;
    setBusy('discard');
    const { error } = await deleteDraft(draftId);
    if (error) return fail(error);
    setBusy(''); addToast('Draft discarded', 'success'); onDrafts();
  };
  const off = (mine: boolean): React.CSSProperties => ({ pointerEvents: busy ? 'none' : 'auto', opacity: busy && !mine ? 0.5 : busy ? 0.7 : 1 });
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {mode === 'draft'
        ? <button type="button" onClick={discard} style={{ ...S.btnDanger, minHeight: 44, ...off(busy === 'discard') }}>{busy === 'discard' ? 'Discarding…' : 'Discard draft'}</button>
        : <button type="button" onClick={onCancel} style={{ ...S.btnGhost, minHeight: 44, ...off(false) }}>Cancel</button>}
      {mode !== 'edit' && (
        <button type="button" onClick={keep} style={{ ...S.btnGhost, minHeight: 44, ...off(busy === 'draft') }}>
          {busy === 'draft' ? 'Saving…' : mode === 'draft' ? 'Save draft' : 'Save as draft'}
        </button>
      )}
      <button type="button" onClick={onSubmit} style={{ ...S.btnPrimary, flex: '1 1 140px', minHeight: 44, ...off(busy === 'job') }}>
        {busy === 'job' ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create job'}
      </button>
      <ConfirmModal {...modalProps} />
    </div>
  );
}
