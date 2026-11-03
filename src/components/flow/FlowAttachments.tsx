// Files on a pipeline (all of them, each labelled with its step) or on one
// step (just that step's). Upload several at once; photos show a thumbnail;
// every file opens from a signed link (private bucket). Remove asks first.
import { useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useConfirm } from '../ui/ConfirmModal';
import ConfirmModal from '../ui/ConfirmModal';
import { uploadFlowFile, deleteFlowFile, signedUrls, fileSize, isImage, ACCEPT } from './flowFiles';
import type { FlowAttachment } from '../../types/flow';

export default function FlowAttachments({ pipelineId, stepId, files, stepNames, onChange, addToast }: {
  pipelineId: string;
  /** null = the pipeline's own panel: shows every file and lets you add pipeline-level ones. */
  stepId: string | null;
  files: FlowAttachment[];
  stepNames: Record<string, string>;
  onChange: (next: FlowAttachment[]) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const shown = stepId ? files.filter(f => f.step_id === stepId) : files;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { ask, modalProps } = useConfirm();

  useEffect(() => {
    let alive = true;
    const need = shown.filter(f => !urls[f.path]);
    if (need.length === 0) return;
    signedUrls(need).then(u => { if (alive) setUrls(prev => ({ ...prev, ...u })); }).catch(e => { if (alive) addToast(friendlyError(e), 'error'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map(f => f.path).join('|')]);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0 || busy) return;
    setBusy(true);
    let next = files, ok = 0;
    for (const file of Array.from(list)) {
      try { next = [await uploadFlowFile(pipelineId, stepId, file), ...next]; ok++; onChange(next); }
      catch (e) { addToast(friendlyError(e), 'error'); }
    }
    if (ok) addToast(ok === 1 ? 'File attached' : `${ok} files attached`, 'success');
    setBusy(false);
    if (input.current) input.current.value = '';
  };
  const remove = async (f: FlowAttachment) => {
    if (!await ask({ title: `Remove ${f.name}?`, confirmLabel: 'Remove', danger: true })) return;
    try { await deleteFlowFile(f); onChange(files.filter(x => x.id !== f.id)); addToast('File removed', 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>Attachments{shown.length ? ` · ${shown.length}` : ''}</span>
        <button type="button" onClick={() => input.current?.click()} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : '+ Attach'}</button>
        <input ref={input} type="file" multiple accept={ACCEPT} onChange={e => upload(e.target.files)} style={{ display: 'none' }} aria-label="Attach files" />
      </div>
      {shown.length === 0 && <div style={{ fontSize: 11, color: T.tx3, padding: '10px 0' }}>Photos, PDFs, Excel or Word — up to 10 MB each.</div>}
      {shown.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.glass1 }}>
          <a href={urls[f.path]} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, color: T.tx, textDecoration: 'none' }}>
            {isImage(f) && urls[f.path]
              ? <img src={urls[f.path]} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              : <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 6, background: T.s3, color: T.tx3, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(f.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}</span>}
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 10, color: T.tx3 }}>{[fileSize(f.size), !stepId && f.step_id ? stepNames[f.step_id] : null].filter(Boolean).join(' · ')}</span>
            </span>
          </a>
          <button type="button" onClick={() => remove(f)} aria-label={`Remove ${f.name}`} style={{ border: 'none', background: 'none', color: T.tx3, fontSize: 16, cursor: 'pointer', width: 32, height: 32 }}>&#215;</button>
        </div>
      ))}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
