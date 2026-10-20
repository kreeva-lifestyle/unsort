// PackStation scanning: how long the packer has left on the parcel just
// scanned before its packing video stops (Pack Cam's "Longest video" limit,
// counted from the scan). Scanning the next parcel ends this video and starts
// the next countdown. It beeps (and vibrates) at 10 seconds left, ticks
// through the last 5 and sounds when the video stops; a long parcel gets
// "+30 s" (packtime_extend_scan: the office PC cuts that video longer).
import { useEffect, useRef, useState } from 'react';
import { T, S, alpha } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import { beep } from '../packtime/beep';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const EXTEND_S = 30;
const SHOW_EXTEND_AT = 20;   // seconds left
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };

export default function PackCountdown({ awb, at, seconds, scanId, canExtend }: { awb: string; at: number; seconds: number; scanId?: string; canExtend: boolean }) {
  const [now, setNow] = useState(Date.now());
  const [extra, setExtra] = useState(0);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');
  const total = seconds + extra;
  const left = Math.max(0, Math.ceil((at + total * 1000 - now) / 1000));
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);

  // Sounds on the way down, once each (not again after a re-render).
  const prev = useRef(left);
  useEffect(() => {
    const was = prev.current; prev.current = left;
    if (left === was) return;
    if (left === 10) { beep(1000, 0.18); vibrate(150); }
    else if (left > 0 && left <= 5) beep(1200, 0.07);
    else if (left === 0 && was > 0) { beep(600, 0.7, 'sawtooth'); vibrate([300, 100, 300]); }
  }, [left]);

  const addTime = async () => {
    if (adding) return;
    if (!scanId) { setErr('This scan is not sent yet — try again in a moment'); return; }
    setAdding(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('packtime_extend_scan', { p_scan: scanId, p_seconds: EXTEND_S });
      if (error) throw error;
      if (data == null) throw new Error('This scan is too old to add time');
      setExtra(Number(data));
      beep(900, 0.1);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setAdding(false); }
  };

  const c = left === 0 ? T.re : left <= 10 ? T.yl : T.gr;
  return (
    <div role="timer" aria-live="off" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${left === 0 ? alpha(T.re, 0.4) : left <= 10 ? alpha(T.yl, 0.5) : T.bd}`, background: left === 0 ? alpha(T.re, 0.08) : 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600 }}>{left === 0 ? 'Video stopped' : 'Packing video — pack now'}</div>
          <div style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{awb}</div>
        </div>
        {canExtend && left > 0 && left <= SHOW_EXTEND_AT && <button type="button" onClick={addTime} style={{ ...S.btnGhost, minHeight: 44, flexShrink: 0, pointerEvents: adding ? 'none' : 'auto', opacity: adding ? 0.5 : 1 }}>{adding ? 'Adding…' : `+${EXTEND_S} s`}</button>}
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.mono, color: c, flexShrink: 0 }}>{fmt(left)}</div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: T.bd2, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(left / total) * 100}%`, background: c, transition: 'width 1s linear' }} />
      </div>
      {extra > 0 && left > 0 && <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>{extra} s added to this parcel's video</div>}
      {err && <div style={{ fontSize: 11, color: T.re, marginTop: 6 }}>{err}</div>}
      {left === 0 && <div style={{ fontSize: 11, color: T.re, fontWeight: 600, marginTop: 6 }}>Time is up — this parcel's video has stopped. Scan the next parcel before you pack it.</div>}
    </div>
  );
}
