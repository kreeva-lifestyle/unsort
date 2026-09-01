// The up-front folder question for the Link Generator: a POPUP before EVERY
// search whenever more than one Settings folder is enabled — the owner's
// rule is "ask each time, as simple as that". Nothing is remembered; every
// Generate / bulk run asks again.
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { T, S, Icon } from '../../../lib/theme';
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
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>
            The SKU is searched only inside the folder you pick (from Settings).
          </div>
          {roots.map(r => (
            <button key={r.url} onClick={() => onPick(r.url)}
              style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, padding: '11px 12px', minHeight: 44, fontSize: 12, fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4 }}><Icon name="folder" size={12} /></span>{r.label || r.url.slice(-24)}
            </button>
          ))}
          <button onClick={() => onPick('')}
            style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', minHeight: 44, padding: '11px 12px', fontSize: 11, color: T.tx3 }}>
            All folders — search everywhere
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}
