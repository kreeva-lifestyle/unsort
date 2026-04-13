/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import Quagga from '@ericblade/quagga2';

const supabase = createClient(
  'https://ulphprdnswznfztawbvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscGhwcmRuc3d6bmZ6dGF3YnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjE4NzYsImV4cCI6MjA4OTkzNzg3Nn0.RRNY3KQhYnkJzSfh-GRoTCgdhDQNhE7kJJrpTq2n_K0'
);

const EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/packtime';

const T = {
  bg: '#060810', s: '#0B0F19', s2: '#0F1420', s3: '#141B2B',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', bl: '#38BDF8', yl: '#F59E0B',
  r: 8, mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
};

interface Courier { id: string; name: string; sheet_name: string; }
interface Camera { id: string; number: string; }
interface ScanEntry { awb: string; time: string; success: boolean; }

// ── Beep ────────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function beep(freq: number, dur: number, type: OscillatorType = 'square') {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = type; o.frequency.value = freq; g.gain.value = 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
function beepOk() { beep(880, 0.12); setTimeout(() => beep(1100, 0.12), 100); }
function beepErr() { beep(300, 0.3, 'sawtooth'); setTimeout(() => beep(200, 0.4, 'sawtooth'), 200); }

// ── API call to Edge Function ───────────────────────────────────────────────────
async function callEdge(body: Record<string, string>): Promise<any> {
  const resp = await fetch(EDGE_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

// ── Component ───────────────────────────────────────────────────────────────────
export default function PackTime() {
  // Config from Supabase
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Setup
  const [courier, setCourier] = useState('');
  const [courierSheet, setCourierSheet] = useState('');
  const [camera, setCamera] = useState('');
  const [started, setStarted] = useState(false);

  // Verify
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Scanning
  const [awbInput, setAwbInput] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanEntry[]>([]);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [duplicateAwb, setDuplicateAwb] = useState('');
  const [scanning, setScanning] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showComplete, setShowComplete] = useState(false);

  // Camera scanner
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraRef = useRef<HTMLDivElement>(null);
  const scanLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch config from Supabase ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: cam }] = await Promise.all([
        supabase.from('packtime_couriers').select('*').eq('is_active', true).order('name'),
        supabase.from('packtime_cameras').select('*').eq('is_active', true).order('number'),
      ]);
      setCouriers(c || []);
      setCameras(cam || []);
      setLoadingConfig(false);
    })();
  }, []);

  // ── Focus ───────────────────────────────────────────────────────────────────
  const focusInput = useCallback(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  useEffect(() => { if (started && !cameraOpen) focusInput(); }, [started, cameraOpen, focusInput]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 1500); return () => clearTimeout(t); } }, [flash]);
  useEffect(() => { if (duplicateAwb) { const t = setTimeout(() => { setDuplicateAwb(''); focusInput(); }, 3000); return () => clearTimeout(t); } }, [duplicateAwb, focusInput]);

  // ── Camera scanner ──────────────────────────────────────────────────────────
  const consecutiveRef = useRef<{ code: string; count: number }>({ code: '', count: 0 });
  const startCam = useCallback(() => {
    if (!cameraRef.current) return;
    setCameraError(''); scanLockRef.current = false;
    consecutiveRef.current = { code: '', count: 0 };
    Quagga.init({
      inputStream: { type: 'LiveStream', target: cameraRef.current, constraints: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } },
      decoder: { readers: ['code_128_reader', 'code_39_reader'], multiple: false },
      locate: true, frequency: 10,
    }, (err: any) => { if (err) setCameraError('Camera not available'); else Quagga.start(); });
    Quagga.onDetected((result: any) => {
      const code = result?.codeResult?.code;
      const errors = result?.codeResult?.decodedCodes?.filter((d: any) => d.error != null).map((d: any) => d.error) || [];
      const avgError = errors.length > 0 ? errors.reduce((a: number, b: number) => a + b, 0) / errors.length : 1;
      // Reject low confidence reads (lower error = better)
      if (!code || scanLockRef.current || avgError > 0.2) return;
      // Require 3 consecutive identical reads
      if (consecutiveRef.current.code === code) {
        consecutiveRef.current.count++;
      } else {
        consecutiveRef.current = { code, count: 1 };
      }
      if (consecutiveRef.current.count < 3) return;
      scanLockRef.current = true;
      if (navigator.vibrate) navigator.vibrate(100);
      Quagga.stop(); setCameraOpen(false);
      setTimeout(() => submitAwb(code.trim()), 100);
    });
  }, []);
  const stopCam = useCallback(() => { try { Quagga.stop(); Quagga.offDetected(); } catch {} }, []);
  useEffect(() => { if (cameraOpen) setTimeout(() => startCam(), 100); return () => stopCam(); }, [cameraOpen, startCam, stopCam]);

  // ── Verify sheet on start ───────────────────────────────────────────────────
  const handleStart = async () => {
    if (!courier || !camera) return;
    const c = couriers.find(x => x.name === courier);
    if (!c) return;
    setCourierSheet(c.sheet_name);
    setVerifying(true); setVerifyResult(null);
    try {
      const data = await callEdge({ action: 'verify', sheetName: c.sheet_name, courier });
      setVerifyResult(data);
      if (data.ok && data.columnsOk !== false) {
        setStarted(true); setSessionCount(0); setRecentScans([]);
      }
    } catch {
      setVerifyResult({ ok: false, error: 'Cannot connect to server. Try again.' });
    }
    setVerifying(false);
  };

  // ── Submit scan ─────────────────────────────────────────────────────────────
  const submitAwb = async (awb: string) => {
    if (!awb || scanning) return;
    // Get sheet name directly from couriers array (don't rely on state timing)
    const sheet = couriers.find(x => x.name === courier)?.sheet_name || courierSheet;
    if (!sheet) { setServerError('No sheet configured for ' + courier); return; }
    setAwbInput(''); setScanning(true); setServerError('');
    try {
      const data = await callEdge({ action: 'scan', awb, sheetName: sheet, cameraNumber: camera });
      if (data.error) {
        setServerError(data.error); beepErr(); setFlash('error');
      } else if (data.duplicate) {
        setDuplicateAwb(awb); beepErr(); setFlash('error');
        setRecentScans(p => [{ awb, time: new Date().toLocaleTimeString('en-IN'), success: false }, ...p].slice(0, 10));
      } else {
        beepOk(); setFlash('success'); setSessionCount(p => p + 1);
        setRecentScans(p => [{ awb, time: new Date().toLocaleTimeString('en-IN'), success: true }, ...p].slice(0, 10));
      }
    } catch {
      setServerError('Connection failed. Try again.'); beepErr(); setFlash('error');
    }
    setScanning(false); focusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); const v = awbInput.trim(); if (v) submitAwb(v); } };

  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loadingConfig) return (
    <div style={{ fontFamily: T.sans, color: T.tx, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: 12 }}>
      <div className="spinner" />
      <span style={{ fontSize: 11, color: T.tx3 }}>Loading Pack Time...</span>
    </div>
  );

  // ── Setup Screen ────────────────────────────────────────────────────────────
  if (!started) return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Pack Time</span>
        <span style={{ fontSize: 10, color: T.tx3 }}>Forward Scan Station</span>
      </div>

      <div style={{ maxWidth: 420 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16 }}>
          {/* Courier */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Courier Company</label>
            <select value={courier} onChange={e => setCourier(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 14, padding: '11px 12px', outline: 'none', cursor: 'pointer' }}>
              <option value="">Select courier...</option>
              {couriers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {couriers.length === 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 4 }}>No couriers configured. Add them in Settings → Pack Time.</div>}
          </div>

          {/* Camera */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Camera Number</label>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cameras.length, 4)}, 1fr)`, gap: 8 }}>
              {cameras.map(c => (
                <div key={c.id} onClick={() => setCamera(c.number)} style={{ padding: '12px 0', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer', transition: 'all .15s', background: camera === c.number ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'rgba(255,255,255,0.03)', color: camera === c.number ? '#fff' : T.tx3, border: `1px solid ${camera === c.number ? T.ac + '44' : T.bd}`, boxShadow: camera === c.number ? `0 4px 16px ${T.ac}33` : 'none' }}>{c.number}</div>
              ))}
            </div>
            {cameras.length === 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 4 }}>No cameras configured. Add them in Settings → Pack Time.</div>}
          </div>

          <button onClick={handleStart} disabled={!courier || !camera || verifying} style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: T.sans, cursor: courier && camera && !verifying ? 'pointer' : 'not-allowed', background: courier && camera && !verifying ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: courier && camera ? '#fff' : T.tx3, boxShadow: courier && camera && !verifying ? `0 4px 20px ${T.ac}40` : 'none', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {verifying && <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'btnSpin .6s linear infinite' }} />}
            {verifying ? 'Verifying Sheet...' : 'Start Scanning'}
          </button>

          {/* Verify error */}
          {verifyResult && !verifyResult.ok && (
            <div style={{ marginTop: 12, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 8, padding: 12, animation: 'fi .2s ease' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.re, marginBottom: 4 }}>Connection Failed</div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>{verifyResult.error}</div>
              {verifyResult.details && <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, marginTop: 4, lineHeight: 1.5 }}>{verifyResult.details}</div>}
            </div>
          )}
          {verifyResult && verifyResult.ok && verifyResult.columnsOk === false && (
            <div style={{ marginTop: 12, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 8, padding: 12, animation: 'fi .2s ease' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.re, marginBottom: 4 }}>Column Mismatch</div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6, marginBottom: 6 }}>{verifyResult.columnsInfo}</div>
              <div style={{ fontSize: 10, color: T.tx3, lineHeight: 1.6, background: 'rgba(0,0,0,.2)', borderRadius: 6, padding: '8px 10px' }}>
                Please fix the sheet columns before scanning. Expected order:<br/>
                <strong style={{ color: T.tx }}>A:</strong> Count &nbsp; <strong style={{ color: T.tx }}>B:</strong> AWB &nbsp; <strong style={{ color: T.tx }}>C:</strong> Timestamp &nbsp; <strong style={{ color: T.tx }}>D:</strong> Camera Number
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── Scanning Screen ─────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', minHeight: '100%', position: 'relative' }} onClick={focusInput}>

      {/* Flash */}
      {flash && <div style={{ position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none', background: flash === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.10)', animation: 'fi .15s ease' }} />}

      {/* Duplicate modal */}
      {duplicateAwb && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="modal-inner" style={{ background: 'rgba(30,10,10,.95)', border: '2px solid rgba(239,68,68,.4)', borderRadius: 16, padding: '24px 20px', textAlign: 'center', maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.re, fontFamily: T.sora, marginBottom: 6 }}>Duplicate Detected!</div>
            <div style={{ fontSize: 12, color: T.tx2, marginBottom: 10 }}>AWB already scanned:</div>
            <div style={{ fontSize: 16, fontFamily: T.mono, color: '#fff', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 14px', wordBreak: 'break-all' }}>{duplicateAwb}</div>
            <div style={{ marginTop: 10, fontSize: 10, color: T.tx3 }}>Not written to sheet</div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 2 }}>{dateStr}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{courier}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,.10)', color: T.ac2, fontWeight: 600, fontFamily: T.mono }}>CAM {camera}</span>
          </div>
        </div>
        <div onClick={() => { stopCam(); setCameraOpen(false); setStarted(false); setSessionCount(0); setRecentScans([]); setVerifyResult(null); }} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd2}`, color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Change</div>
      </div>

      {/* Counter */}
      <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: '12px 16px', textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: T.gr, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>Session Scans</div>
        <div style={{ fontSize: 34, fontWeight: 800, fontFamily: T.sora, color: T.gr, lineHeight: 1 }}>{sessionCount}</div>
      </div>

      {/* Camera */}
      {cameraOpen && (
        <div style={{ marginBottom: 12, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.ac}44`, position: 'relative', background: '#000' }}>
          <div ref={cameraRef} style={{ width: '100%', aspectRatio: '4/3' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
              <div style={{ width: '75%', height: 50, border: `2px solid ${T.ac}`, borderRadius: 8, position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '10%', right: '10%', height: 2, background: T.re, boxShadow: `0 0 10px ${T.re}`, animation: 'scanLine 2s ease-in-out infinite' }} />
              </div>
            </div>
          </div>
          {cameraError && <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: T.yl }}>{cameraError}</div>}
          <div onClick={() => { stopCam(); setCameraOpen(false); }} style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 13 }}>✕</div>
        </div>
      )}

      {/* AWB Input */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Scan AWB Barcode</label>
          <div onClick={() => { if (cameraOpen) { stopCam(); setCameraOpen(false); } else setCameraOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: cameraOpen ? 'rgba(239,68,68,.08)' : 'rgba(99,102,241,.08)', border: `1px solid ${cameraOpen ? 'rgba(239,68,68,.15)' : 'rgba(99,102,241,.12)'}`, color: cameraOpen ? T.re : T.ac2, fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
            {cameraOpen ? 'Close' : 'Camera'}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <input ref={inputRef} type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            value={awbInput} onChange={e => setAwbInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Scan or type AWB number..."
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${flash === 'success' ? T.gr : flash === 'error' ? T.re : T.ac + '55'}`, borderRadius: 10, color: T.tx, fontFamily: T.mono, fontSize: 17, padding: '14px 50px 14px 14px', outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box', boxShadow: `0 0 16px ${flash === 'success' ? 'rgba(34,197,94,.12)' : flash === 'error' ? 'rgba(239,68,68,.12)' : 'rgba(99,102,241,.06)'}` }} />
          <button onClick={() => { const v = awbInput.trim(); if (v) submitAwb(v); }} disabled={scanning || !awbInput.trim()} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: 7, border: 'none', background: awbInput.trim() ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: '#fff', cursor: awbInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
        {scanning && <div style={{ marginTop: 4, fontSize: 10, color: T.ac2 }}>Processing...</div>}
        {serverError && <div style={{ marginTop: 4, fontSize: 10, color: T.re }}>{serverError}</div>}
      </div>

      {/* Recent Scans */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Recent Scans</span>
          <span style={{ fontSize: 9, color: T.tx3 }}>{recentScans.length} entries</span>
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {recentScans.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No scans yet. Start scanning AWB barcodes.</div>}
          {recentScans.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.bd}`, animation: i === 0 ? 'fi .2s ease' : undefined }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.success ? T.gr : T.re, flexShrink: 0, boxShadow: `0 0 5px ${s.success ? T.gr : T.re}55` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.awb}</div>
              </div>
              <div style={{ fontSize: 9, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{s.time}</div>
              {!s.success && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 600 }}>DUP</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Complete Session */}
      {sessionCount > 0 && (
        <button onClick={() => setShowComplete(true)} style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 8, border: `1px solid rgba(34,197,94,.18)`, fontSize: 12, fontWeight: 600, fontFamily: T.sans, background: 'rgba(34,197,94,.05)', color: T.gr, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M20 6L9 17l-5-5" /></svg>
          Complete Session
        </button>
      )}

      {/* Complete modal */}
      {showComplete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center', maxWidth: 360, width: '100%' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Session Complete</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>End scanning for {courier}?</div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 12, marginBottom: 14, textAlign: 'left' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>Courier</div><div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{courier}</div></div>
                <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>Camera</div><div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{camera}</div></div>
                <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>Scanned</div><div style={{ fontSize: 20, fontWeight: 800, color: T.gr, fontFamily: T.sora }}>{sessionCount}</div></div>
                <div><div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 2 }}>Duplicates</div><div style={{ fontSize: 20, fontWeight: 800, color: recentScans.filter(s => !s.success).length > 0 ? T.re : T.tx3, fontFamily: T.sora }}>{recentScans.filter(s => !s.success).length}</div></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowComplete(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Continue</button>
              <button onClick={() => { stopCam(); setCameraOpen(false); setStarted(false); setSessionCount(0); setRecentScans([]); setShowComplete(false); setVerifyResult(null); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.gr}cc, ${T.gr}88)`, color: '#fff', cursor: 'pointer' }}>End Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
