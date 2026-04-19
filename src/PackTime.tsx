/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { BarcodeDetector } from 'barcode-detector/ponyfill';
import { supabase, SUPABASE_ANON_KEY } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';

const EDGE_FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/packtime';

import { T } from './lib/theme';
import type {
  Brand,
  PackTimeCourier,
  PackTimeCamera,
  PackTimeScan,
  PackTimeScanInsert,
} from './types/database';

// In-memory view model for the recent-scans strip. Not a DB row.
interface ScanEntry { awb: string; time: string; success: boolean; pending?: boolean; }

// ── Beep ────────────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

// iOS Safari: AudioContext must be created/resumed from a user gesture.
// resume() is async — by the time beep() plays, context may still be suspended.
// Fix: warm it up on every touch so it's always "running" when beep() fires.
if (typeof window !== 'undefined') {
  const warmAudio = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  };
  document.addEventListener('touchstart', warmAudio, { passive: true });
  document.addEventListener('click', warmAudio);
}

async function beep(freq: number, dur: number, type: OscillatorType = 'square') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = type; o.frequency.value = freq; g.gain.value = 0.3;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
function beepOk() { beep(880, 0.12); setTimeout(() => beep(1100, 0.12), 100); }
function beepErr() { beep(300, 0.3, 'sawtooth'); setTimeout(() => beep(200, 0.4, 'sawtooth'), 200); }

// ── Timestamp helper ────────────────────────────────────────────────────────────
function pad(n: number) { return n < 10 ? '0' + n : String(n); }
function formatTimestamp(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ── Background write queue ──────────────────────────────────────────────────────
type QueueItem = { rows: unknown[][]; sheetName: string; retries: number; };
const writeQueue: QueueItem[] = [];
let flushing = false;

async function flushQueue() {
  if (flushing || writeQueue.length === 0) return;
  flushing = true;
  while (writeQueue.length > 0) {
    // Batch up to 20 rows per request
    const batch: unknown[][] = [];
    const sheetName = writeQueue[0].sheetName;
    while (writeQueue.length > 0 && writeQueue[0].sheetName === sheetName && batch.length < 20) {
      const item = writeQueue.shift()!;
      batch.push(...item.rows);
    }
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(EDGE_FN, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'batch', rows: batch, sheetName }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
    } catch {
      // Re-queue failed batch, preserve retry count
      const retries = (writeQueue[0]?.retries || 0) + 1;
      if (retries <= 3) {
        writeQueue.unshift({ rows: batch, sheetName, retries });
        await new Promise(r => setTimeout(r, 2000));
      }
      if (retries > 3) console.error('PackStation: dropped batch after 3 retries', batch);
    }
  }
  flushing = false;
}

function enqueueWrite(rows: unknown[][], sheetName: string) {
  writeQueue.push({ rows, sheetName, retries: 0 });
  flushQueue();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (writeQueue.length > 0) {
      flushing = false;
      const pending = writeQueue.splice(0);
      for (const item of pending) {
        fetch(EDGE_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'batch', rows: item.rows, sheetName: item.sheetName }), keepalive: true }).catch(() => {});
      }
      e.returnValue = '';
    }
  });
}

// The packtime Edge Function is authenticated by the Supabase gateway via
// apikey + Authorization; it does not consume the user's JWT (it uses a Google
// service account internally). The project now issues user sessions as ES256,
// but the function's runtime only verifies HS256, so forwarding the user token
// produced "HTTP 401 — Unsupported JWT algorithm ES256". Sending the anon key
// (HS256) in both headers satisfies verify_jwt without changing function code.
const getAuthHeaders = async () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'apikey': SUPABASE_ANON_KEY,
});

// POST to the packtime Edge Function with a timeout and a single retry on
// transient network failures. Returns a parsed body plus diagnostic fields so
// the UI can show real error text instead of a generic "Cannot connect".
async function callEdge(body: unknown, timeoutMs = 20000): Promise<any> {
  let lastDetails = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const headers = await getAuthHeaders();
      const resp = await fetch(EDGE_FN, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
      clearTimeout(t);
      const text = await resp.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON response */ }
      if (resp.ok) return parsed ?? { ok: false, error: 'Empty response from server.' };
      const gatewayMsg = parsed?.error || parsed?.message || parsed?.msg || text.slice(0, 180);
      lastDetails = `HTTP ${resp.status}${gatewayMsg ? ` — ${gatewayMsg}` : ''}`;
      return { ok: false, error: resp.status >= 500 ? 'Server error. Try again in a moment.' : 'Request rejected by server.', details: lastDetails };
    } catch (err: any) {
      clearTimeout(t);
      const isTimeout = err?.name === 'AbortError';
      lastDetails = isTimeout ? `timeout after ${timeoutMs}ms` : (err?.message || 'network error');
      if (attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
      return { ok: false, error: isTimeout ? 'Server timed out. Try again.' : 'Cannot connect to server. Try again.', details: lastDetails };
    }
  }
  return { ok: false, error: 'Cannot connect to server. Try again.', details: lastDetails };
}

// ── Component ───────────────────────────────────────────────────────────────────
export default function PackTime({ active }: { active?: boolean } = {}) {
  const { addToast } = useNotifications();
  // Config from Supabase
  const [couriers, setCouriers] = useState<PackTimeCourier[]>([]);
  const [cameras, setCameras] = useState<PackTimeCamera[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Setup
  const [courier, setCourier] = useState('');
  const [courierSheet, setCourierSheet] = useState('');
  const [courierBrand, setCourierBrand] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [camera, setCamera] = useState('');

  const [started, setStarted] = useState(false);

  // Verify
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // Scanning — optimistic
  const [awbInput, setAwbInput] = useState('');
  const [sessionCount, setSessionCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanEntry[]>([]);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [duplicateAwb, setDuplicateAwb] = useState('');
  const [showComplete, setShowComplete] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastScanned, setLastScanned] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetTotal, setSheetTotal] = useState(0);
  const [todaySummaryOpen, setTodaySummaryOpen] = useState(false);
  const [todaySummary, setTodaySummary] = useState<{ courier: string; count: number }[]>([]);

  // History view
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<PackTimeScan[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterCourier, setHistoryFilterCourier] = useState('');
  const [historyFilterBrand, setHistoryFilterBrand] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Local duplicate tracking
  const awbSetRef = useRef<Set<string>>(new Set());
  const rowCountRef = useRef(0);
  const sessionIdRef = useRef('');
  const userIdRef = useRef<string | null>(null);
  const [dbFails, setDbFails] = useState(0);

  // Camera scanner
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const cameraRef = useRef<HTMLDivElement>(null);
  const scanLockRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Fetch config from Supabase ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: cam }, { data: b }] = await Promise.all([
        supabase.from('packtime_couriers').select('*').eq('is_active', true).order('name'),
        supabase.from('packtime_cameras').select('*').eq('is_active', true).order('number'),
        supabase.from('brands').select('name').eq('is_active', true).order('name'),
      ]);
      setCouriers(c || []);
      setCameras(cam || []);
      setBrands(((b as Pick<Brand, 'name'>[] | null) || []).map((x) => x.name));
      setLoadingConfig(false);
      supabase.auth.getUser().then(({ data: { user } }) => { userIdRef.current = user?.id || null; });
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      userIdRef.current = session?.user?.id || null;
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  // ── Focus ───────────────────────────────────────────────────────────────────
  const focusInput = useCallback(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  useEffect(() => { if (started && !cameraOpen) focusInput(); }, [started, cameraOpen, focusInput]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 400); return () => clearTimeout(t); } }, [flash]);
  useEffect(() => { if (duplicateAwb) { const t = setTimeout(() => { setDuplicateAwb(''); focusInput(); }, 1500); return () => clearTimeout(t); } }, [duplicateAwb, focusInput]);

  // Single interval to check sync status for all pending scans
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      if (writeQueue.length === 0 && !flushing) {
        setRecentScans(p => { const hasP = p.some(s => s.pending); return hasP ? p.map(s => s.pending ? { ...s, pending: false } : s) : p; });
        setPendingWrites(0);
      } else { setPendingWrites(writeQueue.length); }
    }, 1000);
    return () => clearInterval(interval);
  }, [started]);

  // ── Camera scanner (barcode-detector ZXing-WASM polyfill — works on all browsers) ──
  const submitRef = useRef<(awb: string) => void>(() => {});
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCam = useCallback(() => {
    cancelAnimationFrame(scanTimerRef.current);
    scanTimerRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
  }, []);

  const startCam = useCallback(() => {
    if (!cameraRef.current) return;
    setCameraError(''); scanLockRef.current = false;
    const container = cameraRef.current;
    container.innerHTML = '';

    // Create video with iOS-required attributes
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    container.appendChild(video);
    videoRef.current = video;

    // ZXing-WASM polyfill — works on iOS Safari, Android Chrome, all browsers
    const detector = new BarcodeDetector({ formats: ['code_128', 'code_39'] });

    // Use high resolution to avoid iPhone 15 Pro ultra-wide lens selection
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    .then(stream => {
      if (!videoRef.current) return; // component unmounted
      streamRef.current = stream;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().then(() => {
          // Scan loop using requestAnimationFrame
          const loop = async () => {
            if (scanLockRef.current || !streamRef.current) return;
            try {
              const results = await Promise.race([detector.detect(video), new Promise<any[]>(r => setTimeout(() => r([]), 3000))]);
              if (results.length > 0) {
                const code = results[0].rawValue?.trim();
                if (code && code.length >= 4 && !scanLockRef.current) {
                  scanLockRef.current = true;
                  if (navigator.vibrate) navigator.vibrate(100);
                  setTimeout(() => submitRef.current(code), 50);
                  // Resume scanning after 1.5s (camera stays open)
                  setTimeout(() => {
                    scanLockRef.current = false;
                    if (streamRef.current) scanTimerRef.current = requestAnimationFrame(loop);
                  }, 1500);
                  return;
                }
              }
            } catch {}
            if (streamRef.current && !scanLockRef.current) scanTimerRef.current = requestAnimationFrame(loop);
          };
          scanTimerRef.current = requestAnimationFrame(loop);
        }).catch(() => setCameraError('Cannot start video. Check camera permissions.'));
      };
    })
    .catch(() => setCameraError('Camera blocked. Go to browser Settings → Site Settings → Camera → Allow.'));
  }, [stopCam]);

  useEffect(() => { if (cameraOpen) setTimeout(() => startCam(), 150); return () => stopCam(); }, [cameraOpen, startCam, stopCam]);

  // ── Init sheet on start (loads existing AWBs for local duplicate detection) ─
  const handleStart = async () => {
    if (!courier || !camera) return;
    const c = couriers.find(x => x.name === courier);
    if (!c) return;
    setCourierSheet(c.sheet_name);
    setCourierBrand(selectedBrand || c.brand || 'FUSIONIC');
    setVerifying(true); setVerifyResult(null);
    const data = await callEdge({ action: 'init', sheetName: c.sheet_name });
    setVerifyResult(data);
    if (data.ok && data.columnsOk !== false) {
      const sheetAwbs = (data.awbs || []).map((a: string) => a.trim().toUpperCase());
      let dbAwbs: string[] = [];
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: dbScans } = await supabase.from('packtime_scans').select('awb').eq('sheet_name', c.sheet_name).gte('scanned_at', thirtyDaysAgo).limit(5000);
        type AwbRow = Pick<PackTimeScan, 'awb'>;
        dbAwbs = ((dbScans as AwbRow[] | null) || []).map((r) => r.awb.trim().toUpperCase());
      } catch {}
      awbSetRef.current = new Set([...sheetAwbs, ...dbAwbs]);
      rowCountRef.current = data.totalRows || 0;
      setSheetTotal(data.totalRows || 0);
      sessionIdRef.current = crypto.randomUUID();
      writeQueue.length = 0; flushing = false;
      setStarted(true); setSessionCount(0); setRecentScans([]); setLastScanned(''); setDbFails(0);
    }
    setVerifying(false);
  };

  // ── Submit scan — OPTIMISTIC (instant feedback, background write) ───────────
  const submitLockRef = useRef(false);
  const submitAwb = useCallback((awb: string) => {
    if (!awb || submitLockRef.current) return;
    submitLockRef.current = true;
    setTimeout(() => { submitLockRef.current = false; }, 300);
    const trimmed = awb.trim().slice(0, 100);
    if (!trimmed || /[\x00-\x1f]/.test(trimmed)) return;
    const key = trimmed.toUpperCase();
    setAwbInput('');

    // Instant local duplicate check
    if (awbSetRef.current.has(key)) {
      setDuplicateAwb(trimmed); beepErr(); setFlash('error');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setRecentScans(p => [{ awb: trimmed, time: new Date().toLocaleTimeString('en-IN'), success: false }, ...p].slice(0, 30));
      focusInput();
      return;
    }

    // SUCCESS — instant feedback
    beepOk(); setFlash('success');
    if (navigator.vibrate) navigator.vibrate(100);
    awbSetRef.current.add(key);
    rowCountRef.current++;
    const count = rowCountRef.current;
    const now = new Date();
    const timestamp = formatTimestamp(now);

    setLastScanned(trimmed);
    setSessionCount(p => p + 1);
    setSheetTotal(p => p + 1);
    setRecentScans(p => [{ awb: trimmed, time: now.toLocaleTimeString('en-IN'), success: true, pending: true }, ...p].slice(0, 30));

    // Save to Supabase DB first, then Sheet
    const scanRow: PackTimeScanInsert = { session_id: sessionIdRef.current, awb: trimmed, courier, camera, brand: courierBrand, sheet_name: courierSheet, user_id: userIdRef.current };
    const row = [count, trimmed, timestamp, camera, courierBrand];
    supabase.from('packtime_scans').insert(scanRow).then(({ error }) => {
      if (error) {
        if (error.code === '23505') {
          console.warn('PackStation: duplicate AWB in DB, rolling back');
          setSessionCount(p => Math.max(0, p - 1));
          setSheetTotal(p => Math.max(0, p - 1));
          rowCountRef.current = Math.max(0, rowCountRef.current - 1);
          setRecentScans(p => p.map(s => s.awb === trimmed ? { ...s, success: false } : s));
          return;
        }
        console.error('PackStation DB insert failed:', error.message, error.code);
        setDbFails(p => p + 1);
        setTimeout(() => {
          supabase.from('packtime_scans').insert(scanRow).then(({ error: e2 }) => {
            if (!e2 || e2.code === '23505') setDbFails(p => Math.max(0, p - 1));
            else console.error('PackStation DB retry failed:', e2.message);
          });
        }, 2000);
        return;
      }
      // Only write to Sheet after DB success
      enqueueWrite([row], courierSheet);
      setPendingWrites(p => p + 1);
    });

    focusInput();
  }, [camera, courier, courierSheet, courierBrand, focusInput]);

  // Keep submitRef in sync for camera callback
  useEffect(() => { submitRef.current = submitAwb; }, [submitAwb]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const v = awbInput.trim(); if (v) submitAwb(v); } };

  // ── Undo last scan (removes from local + Google Sheet) ──────────────────────
  const undoLast = useCallback(() => {
    if (!lastScanned || writeQueue.length > 0) return;
    const awb = lastScanned;
    const key = awb.toUpperCase();
    awbSetRef.current.delete(key);
    setRecentScans(p => p.filter(s => s.awb !== awb));
    setSessionCount(p => Math.max(0, p - 1));
    setSheetTotal(p => Math.max(0, p - 1));
    rowCountRef.current = Math.max(0, rowCountRef.current - 1);
    setLastScanned('');
    beep(500, 0.15);
    focusInput();
    // Background delete from Google Sheet + Supabase DB
    getAuthHeaders().then(headers => fetch(EDGE_FN, { method: 'POST', headers, body: JSON.stringify({ action: 'delete', awb, sheetName: courierSheet }) })
      .then(r => r.json()).then(d => { if (!d.ok) console.error('Sheet undo failed:', d.error); })).catch(e => console.error('Sheet undo error:', e));
    supabase.from('packtime_scans').delete().eq('awb', awb).eq('session_id', sessionIdRef.current);
  }, [lastScanned, courierSheet, focusInput]);

  // ── Delete a specific scan (removes from local + Google Sheet) ─────────────
  const deleteScan = useCallback((awb: string) => {
    awbSetRef.current.delete(awb.toUpperCase());
    setRecentScans(p => p.filter(s => s.awb !== awb));
    const wasSuccess = recentScans.find(s => s.awb === awb)?.success;
    if (wasSuccess) {
      setSessionCount(p => Math.max(0, p - 1));
      setSheetTotal(p => Math.max(0, p - 1));
      rowCountRef.current = Math.max(0, rowCountRef.current - 1);
    }
    if (lastScanned === awb) setLastScanned('');
    beep(500, 0.1);
    // Background delete from Google Sheet + Supabase DB
    getAuthHeaders().then(headers => fetch(EDGE_FN, { method: 'POST', headers, body: JSON.stringify({ action: 'delete', awb, sheetName: courierSheet }) })
      .then(r => r.json()).then(d => { if (!d.ok) console.error('Sheet delete failed:', d.error); })).catch(e => console.error('Sheet delete error:', e));
    supabase.from('packtime_scans').delete().eq('awb', awb).eq('session_id', sessionIdRef.current);
  }, [recentScans, lastScanned, courierSheet]);

  // ── Fetch today's summary across all couriers ──────────────────────────────
  const fetchTodaySummary = useCallback(async () => {
    const results: { courier: string; count: number }[] = [];
    const headers = await getAuthHeaders();
    for (const c of couriers) {
      try {
        const resp = await fetch(EDGE_FN, {
          method: 'POST', headers,
          body: JSON.stringify({ action: 'init', sheetName: c.sheet_name }),
        });
        const data = await resp.json();
        if (data.ok) {
          // Count AWBs from today only (awbs are already filtered to 7 days by server)
          results.push({ courier: c.name, count: data.totalRows || 0 });
        }
      } catch {}
    }
    setTodaySummary(results);
  }, [couriers]);

  // ── Fetch history from Supabase ────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    let query = supabase.from('packtime_scans').select('*', { count: 'estimated' });
    if (historySearch) query = query.ilike('awb', `%${historySearch.replace(/[%_]/g, '\\$&')}%`);
    if (historyFilterCourier) query = query.eq('courier', historyFilterCourier);
    if (historyFilterBrand) query = query.eq('brand', historyFilterBrand);
    query = query.order('scanned_at', { ascending: false }).range(historyPage * historyPageSize, (historyPage + 1) * historyPageSize - 1);
    const { data, count, error } = await query;
    if (error) { console.error('History fetch failed:', error.message); setHistoryLoading(false); return; }
    setHistoryData((data as PackTimeScan[] | null) || []);
    setHistoryTotal(count || 0);
    setHistoryLoading(false);
  }, [historySearch, historyFilterCourier, historyFilterBrand, historyPage, historyPageSize]);

  useEffect(() => { if (showHistory) fetchHistory(); }, [showHistory, fetchHistory]);

  useEffect(() => { if (active) setShowHistory(false); }, [active]);

  // Browser back button support
  useEffect(() => {
    const onPop = () => { if (showHistory) setShowHistory(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showHistory]);

  const deleteHistoryScan = async (id: string) => {
    const record = historyData.find(r => r.id === id);
    if (record && record.sheet_name) {
      try {
        const headers = await getAuthHeaders();
        const resp = await fetch(EDGE_FN, {
          method: 'POST', headers,
          body: JSON.stringify({ action: 'delete', awb: record.awb, sheetName: record.sheet_name }),
        });
        const result = await resp.json();
        if (!result.ok) console.error('Sheet delete failed:', result.error);
      } catch (e) { console.error('Sheet delete error:', e); }
    }
    await supabase.from('packtime_scans').delete().eq('id', id);
    fetchHistory();
  };

  const exportHistory = async () => {
    const allData: PackTimeScan[] = [];
    let page = 0;
    const ps = 5000;
    while (true) {
      let q = supabase.from('packtime_scans').select('*');
      if (historySearch) q = q.ilike('awb', `%${historySearch.replace(/[%_]/g, '\\$&')}%`);
      if (historyFilterCourier) q = q.eq('courier', historyFilterCourier);
      if (historyFilterBrand) q = q.eq('brand', historyFilterBrand);
      const { data } = await q.order('scanned_at', { ascending: false }).range(page * ps, (page + 1) * ps - 1);
      if (!data || data.length === 0) break;
      allData.push(...(data as PackTimeScan[]));
      if (data.length < ps) break;
      page++;
    }
    if (allData.length === 0) return;
    const csv = 'AWB,Courier,Camera,Brand,Scanned At,Session ID\n' + allData.map((r) => {
      const when = r.scanned_at ? new Date(r.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
      return `${r.awb},${r.courier},${r.camera},${r.brand || ''},${when},${r.session_id}`;
    }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `PackStation_History_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const totalPages = Math.ceil(historyTotal / historyPageSize);

  // ── History Screen ─────────────────────────────────────────────────────────
  if (showHistory) return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>Scan History</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setExporting(true); exportHistory().finally(() => setExporting(false)); }} disabled={exporting} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: exporting ? 'default' : 'pointer', fontFamily: T.sans, opacity: exporting ? 0.5 : 1 }}>{exporting ? 'Exporting...' : 'Export CSV'}</button>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPage(0); }} placeholder="Search AWB..."
          style={{ flex: '1 1 180px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 11, padding: '7px 10px', outline: 'none', boxSizing: 'border-box', minWidth: 140 }} />
        <select value={historyFilterCourier} onChange={e => { setHistoryFilterCourier(e.target.value); setHistoryPage(0); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '7px 8px', outline: 'none' }}>
          <option value="">All Couriers</option>
          {couriers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={historyFilterBrand} onChange={e => { setHistoryFilterBrand(e.target.value); setHistoryPage(0); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '7px 8px', outline: 'none' }}>
          <option value="">All Brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={historyPageSize} onChange={e => { setHistoryPageSize(Number(e.target.value)); setHistoryPage(0); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '7px 6px', outline: 'none', width: 55 }}>
          <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>

      {/* Count */}
      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{historyTotal} records found</div>

      {/* Table — horizontal scroll on mobile */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div className="table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth', touchAction: 'pan-x pan-y' }}>
          <div style={{ minWidth: 580 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 90px 50px 80px 1fr 44px', gap: 0, fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ padding: '8px 10px' }}>AWB</div>
              <div style={{ padding: '8px 10px' }}>Courier</div>
              <div style={{ padding: '8px 10px' }}>Cam</div>
              <div style={{ padding: '8px 10px' }}>Brand</div>
              <div style={{ padding: '8px 10px' }}>Time</div>
              <div style={{ padding: '8px 4px' }}></div>
            </div>
            {historyLoading && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div>}
            {!historyLoading && historyData.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No records found.</div>}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {historyData.map(r => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '150px 90px 50px 80px 1fr 44px', gap: 0, borderBottom: `1px solid ${T.bd}`, fontSize: 11 }}>
                  <div style={{ padding: '7px 10px', fontFamily: T.mono, color: T.tx, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.awb}</div>
                  <div style={{ padding: '7px 10px', color: T.tx2, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.courier}</div>
                  <div style={{ padding: '7px 10px', color: T.tx3, fontFamily: T.mono, fontSize: 10 }}>{r.camera}</div>
                  <div style={{ padding: '7px 10px', color: T.gr, fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.brand || '—'}</div>
                  <div style={{ padding: '7px 10px', color: T.tx3, fontFamily: T.mono, fontSize: 10, whiteSpace: 'nowrap' }}>{r.scanned_at ? new Date(r.scanned_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</div>
                  <div style={{ padding: '7px 4px' }}>
                    <button type="button" onClick={() => setConfirmDeleteId(r.id)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', opacity: 0.4 }}>
                      <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }}>
          <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 18px', textAlign: 'center', maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete Scan?</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 14 }}>This will permanently remove the scan from the database and Google Sheet.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { deleteHistoryScan(confirmDeleteId); setConfirmDeleteId(null); }} style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.re}, ${T.re}cc)`, color: '#fff', cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: historyPage === 0 ? T.tx3 : T.tx, fontSize: 10, cursor: historyPage === 0 ? 'default' : 'pointer', opacity: historyPage === 0 ? 0.4 : 1 }}>Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{historyPage + 1} / {totalPages}</span>
          <button onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))} disabled={historyPage >= totalPages - 1} style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: historyPage >= totalPages - 1 ? T.tx3 : T.tx, fontSize: 10, cursor: historyPage >= totalPages - 1 ? 'default' : 'pointer', opacity: historyPage >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
        </div>
      )}
    </div>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loadingConfig) return (
    <div style={{ fontFamily: T.sans, color: T.tx, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, flexDirection: 'column', gap: 12 }}>
      <div className="spinner" />
      <span style={{ fontSize: 11, color: T.tx3 }}>Loading PackStation...</span>
    </div>
  );

  // ── Setup Screen ────────────────────────────────────────────────────────────
  if (!started) return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', paddingBottom: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>PackStation</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {dbFails > 0 && <span style={{ fontSize: 9, color: T.re, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>{dbFails} DB save failed</span>}
          <button onClick={() => { setShowHistory(true); window.history.pushState({ view: 'packstation-history' }, ''); }} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>History</button>
        </div>
      </div>

      {/* Unicommerce Order Stats */}
      <div style={{ maxWidth: 420 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 16 }}>
          {/* Brand */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Brand Name</label>
            <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 14, padding: '11px 12px', outline: 'none', cursor: 'pointer' }}>
              <option value="">Select brand...</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Courier */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Courier Company</label>
            <select value={courier} onChange={e => setCourier(e.target.value)} style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx, fontFamily: T.sans, fontSize: 14, padding: '11px 12px', outline: 'none', cursor: 'pointer' }}>
              <option value="">Select courier...</option>
              {couriers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {couriers.length === 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 4 }}>No couriers configured. Add them in Settings → PackStation.</div>}
          </div>

          {/* Camera */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Camera Number</label>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cameras.length, 4)}, 1fr)`, gap: 8 }}>
              {cameras.map(c => (
                <div key={c.id} onClick={() => setCamera(c.number)} style={{ padding: '12px 0', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: 700, fontFamily: T.mono, cursor: 'pointer', transition: 'all .15s', background: camera === c.number ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'rgba(255,255,255,0.03)', color: camera === c.number ? '#fff' : T.tx3, border: `1px solid ${camera === c.number ? T.ac + '44' : T.bd}`, boxShadow: camera === c.number ? `0 4px 16px ${T.ac}33` : 'none' }}>{c.number}</div>
              ))}
            </div>
            {cameras.length === 0 && <div style={{ fontSize: 10, color: T.yl, marginTop: 4 }}>No cameras configured. Add them in Settings → PackStation.</div>}
          </div>

          <button onClick={handleStart} disabled={!selectedBrand || !courier || !camera || verifying} style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: T.sans, cursor: selectedBrand && courier && camera && !verifying ? 'pointer' : 'not-allowed', background: selectedBrand && courier && camera && !verifying ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: selectedBrand && courier && camera ? '#fff' : T.tx3, boxShadow: selectedBrand && courier && camera && !verifying ? `0 4px 20px ${T.ac}40` : 'none', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', paddingBottom: 80, minHeight: '100%', position: 'relative' }} onClick={focusInput}>

      {/* Flash */}
      {flash && <div style={{ position: 'fixed', inset: 0, zIndex: 300, pointerEvents: 'none', background: flash === 'success' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.10)', animation: 'fi .15s ease' }} />}

      {/* Duplicate — non-blocking banner (audit P0: let operator keep scanning) */}
      {duplicateAwb && (
        <div style={{ position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 400, pointerEvents: 'none', animation: 'slideDown .15s ease' }}>
          <div style={{ background: 'rgba(60,15,15,.95)', border: '1px solid rgba(239,68,68,.45)', borderRadius: 10, padding: '8px 14px', boxShadow: '0 8px 24px rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', gap: 10, color: '#fff' }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.re, textTransform: 'uppercase', letterSpacing: 1 }}>Duplicate — not saved</div>
              <div style={{ fontSize: 12, fontFamily: T.mono, color: '#fff', wordBreak: 'break-all' }}>{duplicateAwb}</div>
            </div>
          </div>
        </div>
      )}

      {/* Write-queue stall warning — sync is lagging (audit P2). Non-blocking so operator keeps going. */}
      {(pendingWrites > 5 || dbFails > 0) && (
        <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.yl, textTransform: 'uppercase', letterSpacing: 1 }}>Sync lagging — keep scanning</div>
            <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>{pendingWrites} scan{pendingWrites === 1 ? '' : 's'} waiting to sync{dbFails > 0 ? `, ${dbFails} failed` : ''}. Retrying in the background.</div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: T.tx3, marginBottom: 2 }}>{dateStr}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.tx, fontFamily: T.sora }}>{courier}</span>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(34,197,94,.10)', color: T.gr, fontWeight: 600 }}>{courierBrand}</span>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(99,102,241,.10)', color: T.ac2, fontWeight: 600, fontFamily: T.mono }}>CAM {camera}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div onClick={() => setSearchOpen(p => !p)} style={{ padding: '5px 8px', borderRadius: 6, background: searchOpen ? 'rgba(99,102,241,.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${searchOpen ? T.ac + '33' : T.bd2}`, color: searchOpen ? T.ac2 : T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          </div>
          {sessionCount === 0
            ? <div onClick={() => { stopCam(); setCameraOpen(false); setStarted(false); setSessionCount(0); setRecentScans([]); setVerifyResult(null); }} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd2}`, color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Change</div>
            : <div style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, color: T.tx3, fontSize: 10, fontWeight: 500, opacity: 0.4, cursor: 'not-allowed' }} title="Complete session first">Change</div>
          }
        </div>
      </div>

      {/* AWB Search */}
      {searchOpen && (
        <div style={{ marginBottom: 10, animation: 'fi .15s ease' }}>
          <div style={{ position: 'relative' }}>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search AWB..." autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 8, color: T.tx, fontFamily: T.mono, fontSize: 13, padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }} />
            {searchQuery.trim() && (
              <div style={{ marginTop: 4, fontSize: 11, fontFamily: T.mono, color: awbSetRef.current.has(searchQuery.trim().toUpperCase()) ? T.re : T.gr }}>
                {awbSetRef.current.has(searchQuery.trim().toUpperCase()) ? '⚠ Already scanned (last 7 days)' : '✓ Not found — safe to scan'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Counter + Today Total */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: T.gr, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Session</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.sora, color: T.gr, lineHeight: 1 }}>{sessionCount}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.12)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: T.ac2, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Sheet Total</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: T.sora, color: T.ac2, lineHeight: 1 }}>{sheetTotal}</div>
        </div>
        <div onClick={() => { setTodaySummaryOpen(true); fetchTodaySummary(); }} style={{ flex: 1, background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.12)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: 8, color: T.yl, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Today</div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.yl, lineHeight: 1 }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2, verticalAlign: 'middle' }}><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </div>
        </div>
      </div>

      {/* Today Summary Modal */}
      {todaySummaryOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)', padding: 16 }} onClick={() => setTodaySummaryOpen(false)}>
          <div className="modal-inner" onClick={e => e.stopPropagation()} style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '18px 16px', maxWidth: 340, width: '100%' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4, textAlign: 'center' }}>Today's Summary</div>
            <div style={{ fontSize: 9, color: T.tx3, textAlign: 'center', marginBottom: 10 }}>As of {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
            {todaySummary.length === 0 && <div style={{ textAlign: 'center', color: T.tx3, fontSize: 11, padding: 16 }}>Loading...</div>}
            {todaySummary.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${T.bd}` }}>
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 500 }}>{s.courier}</span>
                <span style={{ fontSize: 14, fontFamily: T.mono, color: T.ac2, fontWeight: 700 }}>{s.count}</span>
              </div>
            ))}
            {todaySummary.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '0 0 8px 8px' }}>
                <span style={{ fontSize: 12, color: T.tx, fontWeight: 700, fontFamily: T.sora }}>Total</span>
                <span style={{ fontSize: 18, fontFamily: T.mono, color: T.gr, fontWeight: 800 }}>{todaySummary.reduce((a, s) => a + s.count, 0)}</span>
              </div>
            )}
            <button onClick={() => setTodaySummaryOpen(false)} style={{ width: '100%', marginTop: 12, padding: '8px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Last Scanned + Undo */}
      {lastScanned && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.12)', borderRadius: 8, padding: '8px 12px', animation: 'fi .15s ease' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: T.gr, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Last Scanned</div>
            <div style={{ fontSize: 14, fontFamily: T.mono, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastScanned}</div>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); undoLast(); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.08)', color: '#FCA5A5', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: T.sans }}>Undo</button>
        </div>
      )}

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
          <button type="button" onTouchEnd={(e) => { e.preventDefault(); try { const track = streamRef.current?.getVideoTracks()[0]; if (track) { const caps = track.getCapabilities?.() as any; if (caps?.torch) track.applyConstraints({ advanced: [{ torch: !(track.getSettings?.() as any)?.torch } as any] }); } } catch {} }} onClick={() => {}} style={{ position: 'absolute', top: 8, left: 8, zIndex: 100, width: 36, height: 36, borderRadius: 8, background: 'rgba(0,0,0,.8)', border: '1px solid rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: T.yl, strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M9 18h6M10 22h4M12 2v1M4.22 4.22l.71.71M1 12h1M21 12h1M18.36 4.22l-.71.71" /><path d="M16 8a4 4 0 10-8 0c0 2 1.5 3.5 2 5h4c.5-1.5 2-3 2-5z" /></svg>
          </button>
          <button type="button" onTouchEnd={(e) => { e.preventDefault(); stopCam(); setCameraOpen(false); }} onClick={() => { stopCam(); setCameraOpen(false); }} style={{ position: 'absolute', top: 8, right: 8, zIndex: 100, width: 36, height: 36, borderRadius: 8, background: 'rgba(0,0,0,.8)', border: '1px solid rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18, fontWeight: 700, WebkitTapHighlightColor: 'transparent' }}>✕</button>
        </div>
      )}

      {/* AWB Input */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: T.tx3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Scan AWB Barcode</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {pendingWrites > 0 && <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,.10)', border: '1px solid rgba(245,158,11,.18)', color: T.yl, fontWeight: 600 }}>Syncing {pendingWrites}</span>}
            {!cameraOpen && <div onClick={() => setCameraOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.12)', color: T.ac2, fontSize: 9, fontWeight: 600, cursor: 'pointer' }}>
              <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
              Camera
            </div>}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <input ref={inputRef} type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            value={awbInput} onChange={e => setAwbInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Scan or type AWB number..."
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${flash === 'success' ? T.gr : flash === 'error' ? T.re : T.ac + '55'}`, borderRadius: 10, color: T.tx, fontFamily: T.mono, fontSize: 17, padding: '14px 50px 14px 14px', outline: 'none', transition: 'border-color .15s', boxSizing: 'border-box', boxShadow: `0 0 16px ${flash === 'success' ? 'rgba(34,197,94,.15)' : flash === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(99,102,241,.06)'}` }} />
          <button onClick={() => { const v = awbInput.trim(); if (v) submitAwb(v); }} disabled={!awbInput.trim()} style={{ position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: 7, border: 'none', background: awbInput.trim() ? `linear-gradient(135deg, ${T.ac}, ${T.ac2})` : 'rgba(255,255,255,0.05)', color: '#fff', cursor: awbInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div style={{ marginTop: 4, fontSize: 9, color: T.tx3, letterSpacing: 0.3 }}>Scan barcode with camera or type AWB and press Enter</div>
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
            <div key={`${s.awb}-${s.time}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderBottom: `1px solid ${T.bd}`, animation: i === 0 ? 'fi .15s ease' : undefined }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.success ? T.gr : T.re, flexShrink: 0, boxShadow: `0 0 5px ${s.success ? T.gr : T.re}55`, opacity: s.pending ? 0.5 : 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontFamily: T.mono, color: T.tx, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.awb}</div>
              </div>
              <div style={{ fontSize: 8, color: T.tx3, fontFamily: T.mono, flexShrink: 0 }}>{s.time}</div>
              {!s.success && <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(239,68,68,.12)', color: T.re, fontWeight: 600 }}>DUP</span>}
              {s.success && s.pending && <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 3, background: 'rgba(245,158,11,.10)', color: T.yl, fontWeight: 600 }}>SYNC</span>}
              {s.success && !s.pending && <button type="button" onClick={(e) => { e.stopPropagation(); deleteScan(s.awb); }} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', opacity: 0.4 }}>
                <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.tx3, strokeWidth: 2 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>}
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
            <button onClick={() => {
              const successScans = recentScans.filter(s => s.success);
              if (successScans.length === 0) { addToast('No successful scans to export', 'error'); return; }
              const csv = 'AWB,Courier,Camera,Brand,Scanned At\n' + successScans.map(s => `${s.awb},${courier},${camera},${courierBrand},${s.time}`).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `PackTime_${courier}_CAM${camera}_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }} style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 10, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx2, cursor: 'pointer', marginBottom: 10, fontFamily: T.sans }}>Export Session CSV</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowComplete(false)} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: `1px solid ${T.bd2}`, fontSize: 11, fontWeight: 500, background: 'rgba(255,255,255,0.03)', color: T.tx3, cursor: 'pointer' }}>Continue</button>
              <button onClick={() => { stopCam(); setCameraOpen(false); setStarted(false); setSessionCount(0); setRecentScans([]); setShowComplete(false); setVerifyResult(null); setLastScanned(''); }} style={{ flex: 1, padding: '9px 0', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.gr}cc, ${T.gr}88)`, color: '#fff', cursor: 'pointer' }}>End Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
