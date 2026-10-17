// Watch one Pack Cam clip. The packcam function picks the copy to play:
// Dropbox plays right here; a Google Drive copy opens in Drive; a PC-only copy
// opens from the office PC (works on the office network only — a secure page
// cannot embed the PC's plain-http address).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { safeHref } from '../../lib/safeHref';
import type { PackcamClip, PackcamPlay } from '../../types/packcam';
import { playClip, fmtDur, fmtSize } from '../settings/packcam/packcamApi';

export default function ClipPlayer({ clip, onClose }: { clip: Pick<PackcamClip, 'id' | 'awb' | 'camera' | 'scanned_at' | 'duration_s' | 'size_bytes'>; onClose: () => void }) {
  const [play, setPlay] = useState<PackcamPlay | null>(null);
  const [err, setErr] = useState('');
  useModalLock(true);
  useBackClose(true, onClose);
  useEffect(() => {
    let live = true;
    playClip(clip.id).then(p => { if (live) setPlay(p); }).catch(e => { if (live) setErr(friendlyError(e)); });
    return () => { live = false; };
  }, [clip.id]);

  const when = new Date(clip.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const href = play ? safeHref(play.url) : '';
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 720 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...S.modalTitle, fontFamily: T.mono }}>{clip.awb}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>Camera {clip.camera} · {when} · {fmtDur(clip.duration_s)} · {fmtSize(clip.size_bytes)}</div>
          </div>
          <span role="button" aria-label="Close" onClick={onClose} className="touch44" style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16 }}>
          {!play && !err && <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading video…</div>}
          {play && !href && !err && <div style={{ fontSize: 12, color: T.tx3, textAlign: 'center', padding: 20 }}>The office PC reported an address that cannot be opened. Check Settings → Pack Cam.</div>}
          {err && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err}</div>}
          {play?.source === 'dropbox' && href && (
            <video src={href} controls autoPlay playsInline style={{ width: '100%', maxHeight: '65vh', borderRadius: 8, background: T.bg, display: 'block' }} />
          )}
          {play && play.source !== 'dropbox' && href && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 12, color: T.tx2, marginBottom: 14, lineHeight: 1.5 }}>
                {play.source === 'gdrive' ? 'This video is in Google Drive.' : 'This video is kept on the office PC. It opens on a phone or computer connected to the office network.'}
              </div>
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ ...S.btnPrimary, ...S.btnLg, textDecoration: 'none', minHeight: 44 }}>
                {play.source === 'gdrive' ? 'Open in Google Drive' : 'Open from office PC'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
