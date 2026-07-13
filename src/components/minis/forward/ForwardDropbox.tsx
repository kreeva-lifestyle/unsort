// Forward → Dropbox — snap a document, name it by date, send it to the shared
// Dropbox folder. Mobile-only; the live camera reuses the barcode-scanner
// plumbing (imperative <video> + getUserMedia). Full-screen UI is portaled to
// <body> so it escapes the page scroll container.
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { call } from '../dropboxlinks/api';
import { captureFrame, Compressed } from './compressImage';
import FwdSettings from './FwdSettings';

const pad = (n: number) => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (s: string, n: number) => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; };
const fmtDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

type UpStatus = 'up' | 'ok' | 'err';
interface Item { id: string; name: string; dateStr: string; dataUrl: string; status: UpStatus; message?: string }

export default function ForwardDropbox({ addToast, onBack }: { addToast: (m: string, t?: string) => void; onBack: () => void }) {
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const [mode, setMode] = useState<'camera' | 'review'>('camera');
  const [dateStr, setDateStr] = useState(localToday());
  const [pending, setPending] = useState<Compressed | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [cameraError, setCameraError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const camRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; n: number } | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>();

  const atToday = dateStr >= localToday();
  const prevDay = () => setDateStr(addDays(dateStr, -1));
  const nextDay = () => { if (!atToday) setDateStr(addDays(dateStr, 1)); };

  const stopCam = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current = null; }
    trackRef.current = null;
  }, []);
  const startCam = useCallback(() => {
    if (!camRef.current) return;
    setCameraError('');
    const c = camRef.current; c.innerHTML = '';
    const v = document.createElement('video');
    v.autoplay = true; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', 'true'); v.setAttribute('webkit-playsinline', 'true');
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    c.appendChild(v); videoRef.current = v;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(stream => {
        if (!videoRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream; v.srcObject = stream;
        const track = stream.getVideoTracks()[0]; trackRef.current = track || null;
        // Best-effort continuous autofocus so the preview stays sharp (Android
        // honours it; iOS ignores focusMode but keeps its own AF).
        try {
          const caps = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
          if (caps?.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        } catch { /* unsupported — ignore */ }
        v.onloadedmetadata = () => { v.play().catch(() => setCameraError('Cannot start the camera. Check the camera permission for this site.')); };
      })
      .catch(() => setCameraError('Camera blocked. Allow camera access for this site in your browser settings, then reopen.'));
  }, []);

  // Tap-to-focus: point the lens at the tapped spot (best-effort) and flash a
  // focus ring for feedback even where focusMode isn't supported.
  const tapFocus = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    setFocusRing({ x: px, y: py, n: Date.now() });
    clearTimeout(focusTimer.current); focusTimer.current = setTimeout(() => setFocusRing(null), 700);
    const track = trackRef.current; if (!track) return;
    try {
      const caps = track.getCapabilities?.() as { focusMode?: string[]; pointsOfInterest?: unknown } | undefined;
      if (caps && (caps.focusMode?.includes('single-shot') || caps.pointsOfInterest)) {
        track.applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x: px / rect.width, y: py / rect.height }] } as MediaTrackConstraintSet] }).catch(() => {});
      }
    } catch { /* unsupported — the ring still gives feedback */ }
  };

  useEffect(() => {
    if (mobile && mode === 'camera' && !showSettings) { const t = setTimeout(startCam, 150); return () => { clearTimeout(t); stopCam(); }; }
    return () => stopCam();
  }, [mobile, mode, showSettings, startCam, stopCam]);
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  const snap = async () => {
    if (!videoRef.current) return;
    try { const c = await captureFrame(videoRef.current); stopCam(); setPending(c); setMode('review'); }
    catch (e) { addToast(friendlyError(e), 'error'); }
  };

  const doUpload = async (id: string, name: string, ds: string, dataUrl: string) => {
    const { data } = await call({ action: 'fwd_upload', dataUrl, dateStr: ds });
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      if (data?.ok) return { ...it, status: 'ok', name: data.name || name, message: data.path };
      const err = data?.error === 'no_folder' ? 'No upload folder set — open Settings' : data?.error === 'dropbox_not_connected' ? 'Dropbox not connected — ask an admin' : data?.error === 'needs_write_scope' ? 'Dropbox needs reconnecting for uploads' : (data?.details || data?.error || 'Upload failed — tap to retry');
      return { ...it, status: 'err', message: err };
    }));
  };

  const upload = () => {
    if (!pending) return;
    const id = `${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    const name = `${dateStr}.jpg`;
    setItems(prev => [{ id, name, dateStr, dataUrl: pending.dataUrl, status: 'up' as UpStatus }, ...prev]);
    const url = pending.dataUrl; setPending(null); setMode('camera');
    doUpload(id, name, dateStr, url).catch(() => setItems(prev => prev.map(x => x.id === id ? { ...x, status: 'err', message: 'Upload failed — tap to retry' } : x)));
  };
  const retry = (it: Item) => { setItems(prev => prev.map(x => x.id === it.id ? { ...x, status: 'up', message: undefined } : x)); doUpload(it.id, it.name, it.dateStr, it.dataUrl).catch(() => {}); };
  const openDate = () => { const el = dateInputRef.current as any; if (el?.showPicker) { try { el.showPicker(); return; } catch { /* fall through */ } } el?.click(); };

  const sent = items.filter(i => i.status === 'ok').length;
  const ic = { width: 38, height: 38, borderRadius: 11, background: 'rgba(10,13,20,.6)', border: '1px solid rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', cursor: 'pointer', fontSize: 18, flexShrink: 0 } as const;
  const ring = (s: UpStatus) => s === 'ok' ? T.gr : s === 'err' ? T.re : T.bl;

  // Desktop: this is a phone tool.
  if (!mobile) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.tx3, maxWidth: 380, margin: '20px auto' }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, border: `2px solid ${T.ac2}`, margin: '0 auto 14px', position: 'relative' }}><div style={{ position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', width: 16, height: 2, borderRadius: 2, background: T.ac2 }} /></div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 6 }}>Open this on your phone</div>
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>This tool uses the phone camera to snap documents. Sign in on a mobile device to use it.</div>
      <button onClick={onBack} style={{ ...S.btnGhost, marginTop: 16 }}>Back</button>
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 140, background: '#05070c', display: 'flex', flexDirection: 'column' }}>
      {/* top bar: back · date chip · settings */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, padding: 'max(10px, env(safe-area-inset-top)) 12px 14px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(180deg, rgba(0,0,0,.6), transparent)' }}>
        <div onClick={() => { stopCam(); onBack(); }} style={ic} aria-label="Back">‹</div>
        <div style={{ flex: '0 1 240px', display: 'flex', alignItems: 'center', background: 'rgba(10,13,20,.62)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 12, overflow: 'hidden', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div onClick={prevDay} style={{ width: 36, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, cursor: 'pointer' }}>‹</div>
          <div onClick={openDate} style={{ flex: 1, textAlign: 'center', padding: '4px 2px', cursor: 'pointer', position: 'relative' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtDate(dateStr)}</div>
            <div style={{ fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>{dateStr === localToday() ? 'Today · tap to change' : 'tap to change'}</div>
            <input ref={dateInputRef} type="date" value={dateStr} max={localToday()} onChange={e => e.target.value && setDateStr(e.target.value)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }} />
          </div>
          <div onClick={nextDay} style={{ width: 36, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 17, cursor: atToday ? 'default' : 'pointer', opacity: atToday ? 0.3 : 1 }}>›</div>
        </div>
        <div onClick={() => setShowSettings(true)} style={ic} aria-label="Settings">⚙</div>
      </div>

      {/* recent uploads strip */}
      {items.length > 0 && mode === 'camera' && (
        <div style={{ position: 'absolute', top: 'max(70px, calc(env(safe-area-inset-top) + 60px))', left: 0, right: 0, zIndex: 6, display: 'flex', gap: 6, overflowX: 'auto', padding: '0 12px', WebkitOverflowScrolling: 'touch' }}>
          {items.slice(0, 12).map(it => (
            <div key={it.id} onClick={() => it.status === 'err' && retry(it)} title={it.message || it.name} style={{ position: 'relative', flexShrink: 0, cursor: it.status === 'err' ? 'pointer' : 'default' }}>
              <img src={it.dataUrl} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', border: `2px solid ${ring(it.status)}` }} />
              <span style={{ position: 'absolute', bottom: -2, right: -2, width: 13, height: 13, borderRadius: '50%', background: ring(it.status), color: '#05070c', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.status === 'ok' ? '✓' : it.status === 'err' ? '!' : '↑'}</span>
            </div>
          ))}
        </div>
      )}

      {mode === 'camera' ? (
        <>
          <div ref={camRef} onPointerDown={tapFocus} style={{ flex: 1, background: 'linear-gradient(160deg,#10151f,#0a0d15 70%)', overflow: 'hidden' }} />
          {focusRing && <div key={focusRing.n} style={{ position: 'absolute', left: focusRing.x - 32, top: focusRing.y - 32, width: 64, height: 64, border: '2px solid rgba(255,255,255,.9)', borderRadius: '50%', boxShadow: '0 0 0 1px rgba(0,0,0,.3)', pointerEvents: 'none', zIndex: 5, animation: 'fi .2s ease' }} />}
          {/* corner guides */}
          <div style={{ position: 'absolute', inset: '18% 12%', pointerEvents: 'none', zIndex: 4 }}>
            <span style={{ position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderTop: '2px solid rgba(255,255,255,.5)', borderLeft: '2px solid rgba(255,255,255,.5)', borderRadius: '6px 0 0 0' }} />
            <span style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderTop: '2px solid rgba(255,255,255,.5)', borderRight: '2px solid rgba(255,255,255,.5)', borderRadius: '0 6px 0 0' }} />
            <span style={{ position: 'absolute', bottom: 0, left: 0, width: 22, height: 22, borderBottom: '2px solid rgba(255,255,255,.5)', borderLeft: '2px solid rgba(255,255,255,.5)', borderRadius: '0 0 0 6px' }} />
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderBottom: '2px solid rgba(255,255,255,.5)', borderRight: '2px solid rgba(255,255,255,.5)', borderRadius: '0 0 6px 0' }} />
          </div>
          {cameraError && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', color: T.tx2, fontSize: 13, lineHeight: 1.6, zIndex: 5 }}>{cameraError}</div>}
          {/* shutter bar */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 6, padding: '16px 22px calc(22px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(0deg, rgba(0,0,0,.62), transparent)' }}>
            <div style={{ width: 46, fontSize: 10, color: 'rgba(255,255,255,.6)' }}>{sent > 0 && <><b style={{ display: 'block', fontSize: 16, color: '#fff', fontFamily: T.mono }}>{sent}</b>sent</>}</div>
            <button onClick={snap} disabled={!!cameraError} style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', border: '5px solid rgba(255,255,255,.35)', boxShadow: '0 0 0 2px rgba(0,0,0,.25)', cursor: 'pointer', opacity: cameraError ? 0.4 : 1 }} aria-label="Capture" />
            <div style={{ width: 46 }} />
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d15', overflow: 'hidden' }}>
            {pending && <img src={pending.dataUrl} alt="Captured document" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 6, padding: '14px 14px calc(16px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(0deg, rgba(5,7,12,.97), rgba(5,7,12,.75) 70%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: '#fff' }}>{dateStr}.jpg</span>
              {pending && <span style={{ fontSize: 10, color: T.gr, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 5, padding: '2px 6px', fontWeight: 600 }}>~{pending.kb} KB</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.05)', border: `1px solid ${T.bd2}`, borderRadius: 9, overflow: 'hidden' }}>
                <div onClick={prevDay} style={{ width: 30, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ac2, fontSize: 15, cursor: 'pointer' }}>‹</div>
                <div onClick={openDate} style={{ padding: '5px 10px', fontSize: 12, fontWeight: 700, color: T.tx, cursor: 'pointer' }}>{fmtDate(dateStr)}</div>
                <div onClick={nextDay} style={{ width: 30, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ac2, fontSize: 15, cursor: atToday ? 'default' : 'pointer', opacity: atToday ? 0.4 : 1 }}>›</div>
              </div>
              <div onClick={() => setDateStr(localToday())} style={{ fontSize: 11, color: T.ac2, border: '1px solid rgba(99,102,241,.3)', background: T.ac3, borderRadius: 8, padding: '6px 10px', fontWeight: 600, cursor: 'pointer' }}>Today</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setPending(null); setMode('camera'); }} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Retake</button>
              <button onClick={upload} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center' }}>Upload to Dropbox</button>
            </div>
          </div>
        </>
      )}

      {/* settings sheet */}
      {showSettings && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 8, background: T.bg, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 'max(12px, env(safe-area-inset-top)) 14px 12px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10, background: T.s }}>
            <div onClick={() => setShowSettings(false)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.bd2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ac2, cursor: 'pointer' }}>‹</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>Upload Folder</div>
          </div>
          <div style={{ padding: 16, overflowY: 'auto' }}><FwdSettings addToast={addToast} onChanged={() => {}} /></div>
        </div>
      )}
    </div>,
    document.body,
  );
}
