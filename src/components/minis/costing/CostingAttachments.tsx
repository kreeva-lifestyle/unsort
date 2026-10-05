// "Attachments" on a costing sheet: add several photos/PDFs at once (photos
// compressed on the phone first), open a photo full-screen, remove with a
// confirm. On a sheet that already exists the list is written to the DB at
// once; on a new sheet it rides along with Save.
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { logSwallowed } from '../../../lib/errorLogger';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import type { CostingAttachment } from './costingModel';
import { uploadAttachment, persistAttachments, removeObject, fileSize, isImage, MAX_ATTACHMENTS } from './attachmentsStore';

export default function CostingAttachments({ costingId, saved, list, onChange, addToast }: {
  costingId: string;
  saved: boolean;
  list: CostingAttachment[];
  onChange: (next: CostingAttachment[]) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const [view, setView] = useState<CostingAttachment | null>(null);
  const { ask, modalProps } = useConfirm();
  useModalLock(!!view);
  useBackClose(!!view, () => setView(null));

  const add = async (files: File[]) => {
    if (!files.length || busy) return;
    const room = MAX_ATTACHMENTS - list.length;
    if (room <= 0) { addToast(`A sheet can hold ${MAX_ATTACHMENTS} attachments — remove one first`, 'error'); return; }
    const picked = files.slice(0, room);
    let next = list;
    let before = 0, after = 0;
    const failed: string[] = [];
    for (let i = 0; i < picked.length; i++) {
      setBusy(`Compressing & uploading ${i + 1} / ${picked.length}…`);
      try {
        const a = await uploadAttachment(costingId, picked[i]);
        next = [...next, a];
        before += a.original_size ?? a.size; after += a.size;
      } catch (e) { failed.push(friendlyError(e)); }
    }
    const added = next.length - list.length;
    if (added && saved) {
      setBusy('Saving…');
      try { await persistAttachments(costingId, next); }
      catch (e) {
        // The files are up but the sheet did not record them: keep them on
        // screen so the next Save stores them, and say so.
        addToast(`${friendlyError(e)} — press Save to keep the new attachments`, 'error');
      }
    }
    onChange(next);
    setBusy('');
    if (added) addToast(`${added} attached · ${fileSize(before)} → ${fileSize(after)}${saved ? '' : ' — remember to Save'}`, 'success');
    if (failed.length) addToast(failed.join(' · '), 'error');
    if (files.length > picked.length) addToast(`Only ${picked.length} added — a sheet holds up to ${MAX_ATTACHMENTS}`, 'error');
  };

  const remove = async (a: CostingAttachment) => {
    if (busy) return;
    if (!await ask({ title: `Remove ${a.name}?`, message: 'The file is deleted from this costing sheet.', confirmLabel: 'Remove', danger: true })) return;
    setBusy('Removing…');
    const next = list.filter(x => x.path !== a.path);
    try {
      if (saved) await persistAttachments(costingId, next);
      onChange(next);
      // The sheet no longer points at it; a leftover file is only storage.
      try { await removeObject(costingId, a); } catch (e) { logSwallowed('Costing attachment file delete', e); }
      addToast('Attachment removed', 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setBusy('');
  };

  const tile: CSSProperties = { position: 'relative', boxSizing: 'border-box', width: 84, height: 84, borderRadius: 10, border: `1px solid ${T.bd2}`, background: T.glass1, overflow: 'hidden', flexShrink: 0 };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 8px', marginBottom: 6 }}>
        <label style={{ ...S.fLabel, margin: 0, whiteSpace: 'nowrap' }}>Attachments{list.length ? ` · ${list.length}` : ''}</label>
        <span style={{ fontSize: 11, color: T.tx3 }}>Photos are compressed before upload · PDFs up to 10 MB</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {list.map(a => (
          <div key={a.path} style={tile}>
            {isImage(a)
              ? <button onClick={() => setView(a)} aria-label={`Open ${a.name}`} style={{ border: 'none', padding: 0, margin: 0, width: '100%', height: '100%', cursor: 'zoom-in', background: 'none' }}>
                  <img src={a.url} alt={a.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              : <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', height: '100%', padding: 6, textDecoration: 'none', color: T.tx2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.re, border: `1px solid ${T.re}`, borderRadius: 4, padding: '1px 5px' }}>PDF</span>
                  <span style={{ fontSize: 10, lineHeight: 1.25, textAlign: 'center', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{a.name}</span>
                  <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{fileSize(a.size)}</span>
                </a>}
            {/* The hit box grows to 44px on the phone (.cost-att-x); the visible circle stays 28px. */}
            <button onClick={() => remove(a)} className="cost-att-x" aria-label={`Remove ${a.name}`} disabled={!!busy}
              style={{ position: 'absolute', top: 2, right: 2, width: 28, height: 28, padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'oklch(0 0 0 / .6)', color: T.tx, fontSize: 16, lineHeight: '28px', textAlign: 'center' }}>&#215;</span>
            </button>
          </div>
        ))}
        {list.length < MAX_ATTACHMENTS && (
          <label style={{ ...tile, border: `1.5px dashed ${T.bd2}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: busy ? 'default' : 'pointer', pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.6 : 1, width: busy ? 170 : 84, padding: 6, textAlign: 'center' }}>
            <input type="file" multiple accept="image/*,application/pdf" style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
              onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; add(fs); }} />
            <span style={{ fontSize: busy ? 11 : 20, color: busy ? T.ac2 : T.tx3, lineHeight: 1.3 }}>{busy || '+'}</span>
            {!busy && <span style={{ fontSize: 10, color: T.tx3 }}>Photo / PDF</span>}
          </label>
        )}
      </div>

      {view && createPortal(
        <div onClick={() => setView(null)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'oklch(0.05 0.02 265 / .94)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.name} · {fileSize(view.size)}</span>
            <button onClick={() => setView(null)} aria-label="Close" style={{ border: 'none', background: 'none', color: T.tx3, fontSize: 24, lineHeight: 1, cursor: 'pointer', minWidth: 44, minHeight: 44 }}>&#215;</button>
          </div>
          <img src={view.url} alt={view.name} onClick={e => e.stopPropagation()}
            style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain', paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }} />
        </div>,
        document.body)}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
