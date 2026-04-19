// BarcodeScanner modal — barcode + OCR text scanning
// Uses the same barcode-detector ponyfill as PackTime for library consistency (audit P1).
import { useState, useEffect, useRef, useCallback } from 'react';
import { BarcodeDetector } from 'barcode-detector/ponyfill';
import { T, S } from '../../lib/theme';

export default function BarcodeScanner({ onScan, onClose, scanError }: { onScan: (code: string) => Promise<boolean>; onClose: () => void; scanError?: string }) {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);
  const ocrVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'barcode' | 'text'>('barcode');
  const [cameraError, setCameraError] = useState('');
  const [manualId, setManualId] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [scanning, setScanning] = useState(true);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const mountedRef = useRef(true);

  const stopBarcode = useCallback(() => {
    scanLockRef.current = true;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current = null; }
  }, []);

  // Barcode mode — BarcodeDetector (ZXing-WASM ponyfill works on iOS/Android/desktop)
  const startBarcode = useCallback(() => {
    if (!videoContainerRef.current || mode !== 'barcode') return;
    const container = videoContainerRef.current;
    container.innerHTML = '';
    scanLockRef.current = false; setScanning(true); setLastCode('');

    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    container.appendChild(video);
    videoRef.current = video;

    const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (!videoRef.current) return;
        streamRef.current = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => video.play().then(() => {
          const loop = async () => {
            if (scanLockRef.current || !streamRef.current) return;
            try {
              const results = await detector.detect(video);
              if (results.length > 0) {
                const code = results[0].rawValue?.trim();
                if (code && code.length >= 4) {
                  scanLockRef.current = true;
                  setLastCode(code); setScanning(false);
                  if (navigator.vibrate) navigator.vibrate(100);
                  const found = await onScan(code);
                  if (!found && mountedRef.current) setTimeout(() => { if (mountedRef.current) startBarcode(); }, 2000);
                  return;
                }
              }
            } catch {}
            if (streamRef.current) requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }).catch(() => setCameraError('Camera not available.'));
      })
      .catch(() => setCameraError('Camera not available.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, onScan]);

  // OCR mode - start camera
  const startOcrCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
      if (ocrVideoRef.current) { ocrVideoRef.current.srcObject = stream; ocrVideoRef.current.play(); }
    } catch { setCameraError('Camera not available.'); }
  }, []);

  const extractId = (text: string): string | null => {
    // Try standard format: UNS-DDMMYY-XXXX
    const m1 = text.match(/UNS[-–—.\s]*\d{6}[-–—.\s]*\d{4}/i);
    if (m1) return m1[0].replace(/[^A-Z0-9]/gi, '').replace(/^(UNS)(\d{6})(\d{4})$/i, '$1-$2-$3').toUpperCase();
    // Try looser: UNS followed by digits
    const m2 = text.match(/UNS\D*(\d[\d\s-]{8,14}\d)/i);
    if (m2) { const digits = m2[1].replace(/\D/g, ''); if (digits.length >= 10) return `UNS-${digits.slice(0,6)}-${digits.slice(6,10)}`; }
    return null;
  };

  const captureAndOcr = async () => {
    if (!ocrVideoRef.current || !canvasRef.current) return;
    setOcrProcessing(true); setOcrStatus('Capturing...');
    const video = ocrVideoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setOcrProcessing(false); return; }
    ctx.drawImage(video, 0, 0);

    setOcrStatus('Reading...');
    try {
      const blob = await new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/png'));
      const formData = new FormData();
      formData.append('file', blob, 'scan.png');
      formData.append('language', 'eng');
      formData.append('OCREngine', '2');

      // Proxy through Supabase Edge Function so the OCR.space API key stays server-side (security audit)
      const resp = await fetch('https://ulphprdnswznfztawbvg.supabase.co/functions/v1/ocr', { method: 'POST', body: formData });
      const json = await resp.json();
      const text = json?.ParsedResults?.[0]?.ParsedText || '';
      const id = extractId(text);
      if (id) {
        setLastCode(id); setOcrStatus('');
        if (navigator.vibrate) navigator.vibrate(100);
        onScan(id);
      } else {
        setOcrStatus('No ID found. Write clearly: UNS-DDMMYY-XXXX');
        setLastCode('');
      }
    } catch { setOcrStatus('Network error. Try manual entry.'); }
    setOcrProcessing(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    if (mode === 'barcode') startBarcode();
    if (mode === 'text') startOcrCamera();
    const videoEl = ocrVideoRef.current;
    return () => {
      mountedRef.current = false;
      stopBarcode();
      if (videoEl?.srcObject) (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const switchMode = (m: 'barcode' | 'text') => {
    stopBarcode();
    if (ocrVideoRef.current?.srcObject) (ocrVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setLastCode(''); setOcrStatus(''); setCameraError(''); setMode(m);
  };

  const handleManual = () => { if (manualId.trim()) { setLastCode(manualId.trim()); onScan(manualId.trim()); } };

  return (
    <div style={S.modalOverlay}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 380 }}>
        <div style={S.modalHead}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.tx }}>Scan ID</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ padding: 14 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', background: T.s2, borderRadius: 6, padding: 3, marginBottom: 10 }}>
            <div onClick={() => switchMode('barcode')} style={{ flex: 1, padding: '6px 0', borderRadius: 4, textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'barcode' ? T.ac : 'transparent', color: mode === 'barcode' ? '#fff' : T.tx3, transition: 'all .15s' }}>Barcode</div>
            <div onClick={() => switchMode('text')} style={{ flex: 1, padding: '6px 0', borderRadius: 4, textAlign: 'center', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: mode === 'text' ? T.ac : 'transparent', color: mode === 'text' ? '#fff' : T.tx3, transition: 'all .15s' }}>Text (OCR)</div>
          </div>

          {/* Barcode camera */}
          {mode === 'barcode' && !cameraError && <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: 10, background: '#000', aspectRatio: '4/3' }}>
            <div ref={videoContainerRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ width: '75%', height: 50, border: `2px solid ${scanning ? T.ac : T.gr}`, borderRadius: 8, position: 'relative' }}>
                {scanning && <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, background: T.re, boxShadow: `0 0 10px ${T.re}`, animation: 'scanLine 2s ease-in-out infinite' }} />}
              </div>
            </div>
          </div>}

          {/* OCR camera */}
          {mode === 'text' && !cameraError && <div style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', marginBottom: 10, background: '#000', aspectRatio: '4/3' }}>
            <video ref={ocrVideoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ width: '80%', height: 40, border: `2px dashed ${T.ac}`, borderRadius: 6 }} />
            </div>
          </div>}

          {mode === 'text' && !cameraError && <div onClick={captureAndOcr} style={{ ...S.btnPrimary, width: '100%', justifyContent: 'center', marginBottom: 10, padding: '10px 0', opacity: ocrProcessing ? 0.6 : 1, pointerEvents: ocrProcessing ? 'none' : 'auto' }}>
            {ocrProcessing ? <><div className="spinner" style={{ width: 14, height: 14 }} /> {ocrStatus}</> : 'Capture & Read Text'}
          </div>}

          {cameraError && <div style={{ background: T.s2, borderRadius: 10, padding: 20, marginBottom: 10, textAlign: 'center' }}><p style={{ fontSize: 12, color: T.yl }}>{cameraError}</p></div>}

          {/* Result */}
          {lastCode && <div style={{ borderRadius: T.r, padding: '8px 12px', marginBottom: 10, fontSize: 12, textAlign: 'center', fontFamily: T.mono, ...(scanError ? { background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', color: T.re } : { background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)', color: T.gr }) }}>
            {scanError || `Detected: ${lastCode}`}
            {scanError && mode === 'barcode' && <p style={{ fontSize: 10, color: T.tx3, margin: '4px 0 0' }}>Re-scanning...</p>}
          </div>}
          {ocrStatus && !ocrProcessing && <p style={{ fontSize: 11, color: T.yl, textAlign: 'center', marginBottom: 8 }}>{ocrStatus}</p>}

          {/* Manual entry */}
          <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 10 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Or type ID</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={manualId} onChange={(e) => setManualId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleManual(); }} placeholder="UNS-DDMMYY-XXXX" style={{ ...S.fInput, flex: 1, fontFamily: T.mono, fontSize: 12 }} />
              <span onClick={handleManual} style={S.btnPrimary}>Go</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
