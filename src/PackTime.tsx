/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Theme (synced with App.tsx) ─────────────────────────────────────────────────
const T = {
  bg: '#060810', s: '#0B0F19', s2: '#0F1420', s3: '#141B2B',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', bl: '#38BDF8', yl: '#F59E0B',
  r: 8, mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
  glass1: 'rgba(255,255,255,0.02)', glass2: 'rgba(255,255,255,0.04)',
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
};

const COURIERS = ['XpressBees', 'Shadow Fax', 'Delhivery', 'Ecom Express', 'Amazon', 'Mirraw'];
const CAMERAS = ['1', '2', '3', '4'];

const API_BASE = (import.meta as any).env.DEV ? 'http://localhost:3001' : '';

interface ScanEntry {
  awb: string;
  time: string;
  success: boolean;
}

// ── Beep sound via Web Audio API ────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function beep(freq: number, duration: number, type: OscillatorType = 'square') {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* audio not available */ }
}
function beepSuccess() { beep(880, 0.12, 'square'); setTimeout(() => beep(1100, 0.12, 'square'), 100); }
function beepError() { beep(300, 0.3, 'sawtooth'); setTimeout(() => beep(200, 0.4, 'sawtooth'), 200); }

// ── Pack Time Component ─────────────────────────────────────────────────────────
export default function PackTime() {
  const [courier, setCourier] = useState('');
  const [camera, setCamera] = useState('');
  const [started, setStarted] = useState(false);

  // Scanning state
  const [awbInput, setAwbInput] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanEntry[]>([]);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [duplicateAwb, setDuplicateAwb] = useState('');
  const [scanning, setScanning] = useState(false);
  const [serverError, setServerError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input focused
  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    if (started) focusInput();
  }, [started, focusInput]);

  // Flash animation clear
  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(null), 1500);
      return () => clearTimeout(t);
    }
  }, [flash]);

  // Duplicate modal clear
  useEffect(() => {
    if (duplicateAwb) {
      const t = setTimeout(() => { setDuplicateAwb(''); focusInput(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [duplicateAwb, focusInput]);

  const handleStart = () => {
    if (!courier || !camera) return;
    setStarted(true);
    setSessionCount(0);
    setRecentScans([]);
  };

  const handleScan = async () => {
    const awb = awbInput.trim();
    if (!awb || scanning) return;

    setAwbInput('');
    setScanning(true);
    setServerError('');

    try {
      const resp = await fetch(`${API_BASE}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awb, courier, cameraNumber: camera }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setServerError(data.error || 'Server error');
        beepError();
        setFlash('error');
      } else if (data.duplicate) {
        setDuplicateAwb(awb);
        beepError();
        setFlash('error');
        setRecentScans(prev => [{ awb, time: new Date().toLocaleTimeString('en-IN'), success: false }, ...prev].slice(0, 10));
      } else {
        beepSuccess();
        setFlash('success');
        setSessionCount(prev => prev + 1);
        setRecentScans(prev => [{ awb, time: new Date().toLocaleTimeString('en-IN'), success: true }, ...prev].slice(0, 10));
      }
    } catch (err: any) {
      setServerError('Cannot reach server. Is it running?');
      beepError();
      setFlash('error');
    }

    setScanning(false);
    focusInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan();
    }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  // ── Setup Screen ──────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div style={{ fontFamily: T.sans, color: T.tx, padding: '20px 16px', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.sora, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>Pack Time</div>
            <div style={{ fontSize: 11, color: T.tx3, letterSpacing: 2, textTransform: 'uppercase' }}>Forward Scan Station</div>
          </div>

          {/* Setup Card */}
          <div style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(24px)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Courier Company</label>
              <select value={courier} onChange={e => setCourier(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 15, padding: '12px 14px', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}>
                <option value="">Select courier...</option>
                {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Camera Number</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {CAMERAS.map(c => (
                  <div key={c} onClick={() => setCamera(c)} style={{ padding: '14px 0', borderRadius: 8, textAlign: 'center', fontSize: 18, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer', transition: 'all .15s', background: camera === c ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'rgba(255,255,255,0.03)', color: camera === c ? '#fff' : T.tx3, border: `1px solid ${camera === c ? T.ac + '44' : T.bd}`, boxShadow: camera === c ? `0 4px 16px ${T.ac}33` : 'none' }}>{c}</div>
                ))}
              </div>
            </div>

            <button onClick={handleStart} disabled={!courier || !camera} style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, fontFamily: T.sans, cursor: courier && camera ? 'pointer' : 'not-allowed', background: courier && camera ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: courier && camera ? '#fff' : T.tx3, boxShadow: courier && camera ? `0 4px 20px ${T.ac}40` : 'none', transition: 'all .2s', letterSpacing: 0.5 }}>
              Start Scanning
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Scanning Screen ───────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', minHeight: '100%', position: 'relative' }} onClick={focusInput}>

      {/* Flash overlay */}
      {flash && <div style={{ position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none', background: flash === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.10)', transition: 'opacity .3s', animation: 'fi .15s ease' }} />}

      {/* Duplicate modal */}
      {duplicateAwb && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div className="modal-inner" style={{ background: 'rgba(30,10,10,.95)', border: '2px solid rgba(239,68,68,.4)', borderRadius: 16, padding: '28px 24px', textAlign: 'center', maxWidth: 360, width: '100%', boxShadow: `0 0 60px rgba(239,68,68,.15)` }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.re, fontFamily: T.sora, marginBottom: 8 }}>Duplicate Detected!</div>
            <div style={{ fontSize: 14, color: T.tx2, marginBottom: 12 }}>AWB already scanned:</div>
            <div style={{ fontSize: 18, fontFamily: T.mono, color: '#fff', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '10px 16px', wordBreak: 'break-all' }}>{duplicateAwb}</div>
            <div style={{ marginTop: 14, fontSize: 11, color: T.tx3 }}>Not written to sheet</div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 2 }}>{dateStr}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{courier}</span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,.10)', color: T.ac2, fontWeight: 600, fontFamily: T.mono }}>CAM {camera}</span>
          </div>
        </div>
        <div onClick={() => { setStarted(false); setSessionCount(0); setRecentScans([]); }} style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd2}`, color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer', transition: 'all .15s' }}>
          Change
        </div>
      </div>

      {/* Session counter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: T.gr, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Session Scans</div>
          <div style={{ fontSize: 36, fontWeight: 800, fontFamily: T.sora, color: T.gr, lineHeight: 1 }}>{sessionCount}</div>
        </div>
      </div>

      {/* AWB Input */}
      <div style={{ marginBottom: 14, position: 'relative' }}>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Scan AWB Barcode</label>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={awbInput}
            onChange={e => setAwbInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan or type AWB number..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${flash === 'success' ? T.gr : flash === 'error' ? T.re : T.ac + '55'}`,
              borderRadius: 12, color: T.tx, fontFamily: T.mono, fontSize: 18, padding: '16px 56px 16px 16px',
              outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box',
              boxShadow: `0 0 20px ${flash === 'success' ? 'rgba(34,197,94,.15)' : flash === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(99,102,241,.08)'}`,
            }}
          />
          <button onClick={handleScan} disabled={scanning || !awbInput.trim()} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 8, border: 'none', background: awbInput.trim() ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: '#fff', cursor: awbInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
        {scanning && <div style={{ marginTop: 6, fontSize: 11, color: T.ac2 }}>Processing...</div>}
        {serverError && <div style={{ marginTop: 6, fontSize: 11, color: T.re }}>{serverError}</div>}
      </div>

      {/* Recent Scans */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Recent Scans</span>
          <span style={{ fontSize: 9, color: T.tx3 }}>{recentScans.length} entries</span>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {recentScans.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No scans yet. Start scanning AWB barcodes.</div>}
          {recentScans.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}`, animation: i === 0 ? 'fi .2s ease' : undefined }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.success ? T.gr : T.re, flexShrink: 0, boxShadow: `0 0 6px ${s.success ? T.gr : T.re}55` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontFamily: T.mono, color: T.tx, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.awb}</div>
              </div>
              <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{s.time}</div>
              {!s.success && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 600, flexShrink: 0 }}>DUP</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
