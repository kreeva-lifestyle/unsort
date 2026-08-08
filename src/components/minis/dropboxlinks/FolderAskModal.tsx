// The up-front folder question for the Link Generator: shown BEFORE any
// search when more than one Settings folder is enabled and none is committed
// yet — the owner's rule is "ask first, then perform", so the search may not
// start until a folder is chosen. Picking a folder commits it (remembered,
// shown in the toolbar select); "All folders" applies to this run only, so
// the question comes back next time.
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { T, S } from '../../../lib/theme';
import { useBackClose } from '../../../hooks/useBackClose';
import { GenRoot } from './api';

export default function FolderAskModal({ roots, onPick, onClose }: {
  roots: GenRoot[];
  onPick: (url: string) => void; // '' = all folders, this run only
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  return createPortal((
    <div style={{ ...S.modalOverlay }} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 380 }} onClick={ev => ev.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Search in which folder?</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>
            The SKU is searched only inside the folder you pick (from Settings). Your pick is remembered — change it anytime in the toolbar.
          </div>
          {roots.map(r => (
            <button key={r.url} onClick={() => onPick(r.url)}
              style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '11px 12px', minHeight: 44, fontSize: 12, fontWeight: 600 }}>
              📁 {r.label || r.url.slice(-24)}
            </button>
          ))}
          <button onClick={() => onPick('')}
            style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '11px 12px', fontSize: 11, color: T.tx3 }}>
            All folders — just this run (asks again next time)
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
