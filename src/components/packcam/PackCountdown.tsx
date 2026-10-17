// PackStation scanning: how long the packer has left on the parcel just
// scanned before its packing video stops (Pack Cam's "Longest video" limit,
// counted from the scan). Scanning the next parcel ends this video and starts
// the next countdown.
import { useEffect, useState } from 'react';
import { T, alpha } from '../../lib/theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function PackCountdown({ awb, at, seconds }: { awb: string; at: number; seconds: number }) {
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((at + seconds * 1000 - now) / 1000));
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  const c = left === 0 ? T.re : left <= 10 ? T.yl : T.gr;
  return (
    <div role="timer" aria-live="off" style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${left === 0 ? alpha(T.re, 0.4) : T.bd}`, background: left === 0 ? alpha(T.re, 0.08) : 'rgba(255,255,255,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, color: T.tx3, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600 }}>{left === 0 ? 'Video stopped' : 'Packing video'}</div>
          <div style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{awb}</div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.mono, color: c, flexShrink: 0 }}>{fmt(left)}</div>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: T.bd2, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(left / seconds) * 100}%`, background: c, transition: 'width 1s linear' }} />
      </div>
      {left === 0 && <div style={{ fontSize: 11, color: T.re, fontWeight: 600, marginTop: 6 }}>Time is up — this parcel's video has stopped. Scan the next parcel.</div>}
    </div>
  );
}
