// Payment-QR picker for the employee editor: thumbnail + upload/change/remove,
// with a tap-to-zoom lightbox (a QR is scanned off the screen, so it has to be
// viewable at size). Extracted from Employees.tsx to keep that file readable.
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { uploadQrImage, deleteQrObject } from '../../lib/qrUpload';
import { useBackClose } from '../../hooks/useBackClose';

export default function QrField({ value, savedUrl, onChange, addToast }: {
  value: string; savedUrl: string | null;
  onChange: (url: string) => void; addToast: (m: string, t?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useBackClose(zoom, () => setZoom(false));

  const pick = async (file: File) => {
    setBusy(true);
    const r = await uploadQrImage(file);
    setBusy(false);
    if (r.error) { addToast(r.error, 'error'); return; }
    if (value && value !== savedUrl) deleteQrObject(value); // an unsaved upload being replaced
    onChange(r.url!);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div onClick={() => value && setZoom(true)} title={value ? 'Click to zoom' : undefined} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: value ? '#fff' : 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: value ? 'zoom-in' : 'default' }}>
          {value ? <img src={value} alt="Payment QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 9, color: T.tx3, textAlign: 'center', padding: 4 }}>No QR</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Uploading…' : value ? 'Change QR' : 'Upload QR'}</button>
          {value && !busy && <button type="button" onClick={() => onChange('')} style={{ background: 'none', border: 'none', color: T.re, fontSize: 10, cursor: 'pointer', padding: 0, textAlign: 'left' }}>Remove</button>}
        </div>
      </div>

      {zoom && value && createPortal((
        <div onClick={() => setZoom(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(4,6,12,.88)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'zoom-out', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, maxWidth: 'min(86vw, 480px)', maxHeight: '76vh', display: 'flex' }}>
            <img src={value} alt="Payment QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 11, color: T.tx3 }}>Tap anywhere to close</div>
        </div>
      ), document.body)}
    </>
  );
}
