// PackStation scanning → the session's recent scans: collapsible list with
// CSV export, Undo on the newest, and each scan's packing-video mark
// (moved out of PackTime.tsx).
import { T, S } from '../../lib/theme';
import { ClipMarkTag, type ClipMark } from '../packcam/ScanCamStatus';

// In-memory view model for the recent-scans strip. Not a DB row.
export interface ScanEntry { awb: string; time: string; success: boolean; /** phone = on this phone, saved = in the app, sheet = in the Google Sheet too */ state?: 'phone' | 'saved' | 'sheet'; at?: number; id?: string; }

const STATE: Record<NonNullable<ScanEntry['state']>, { label: string; color: string }> = { phone: { label: '· on phone', color: T.yl }, saved: { label: '· saved', color: T.tx3 }, sheet: { label: '· in sheet', color: T.gr } };

interface Props {
  scans: ScanEntry[]; successCount: number; open: boolean; markOf: (awb: string) => ClipMark | undefined;
  onToggle: () => void; onExport: () => void; onUndo: () => void;
}

export default function RecentScans({ scans, successCount, open, markOf, onToggle, onExport, onUndo }: Props) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: open ? `1px solid ${T.bd}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1.5, textTransform: 'uppercase' }}>Recent Scans</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: T.tx3 }}>{scans.length} this session</span>
          {successCount > 0 && <button type="button" className="touch44" onClick={e => { e.stopPropagation(); onExport(); }} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.03)', color: T.tx3, fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Export</button>}
        </div>
      </div>
      {open && <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {scans.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No scans yet. Start scanning AWB barcodes.</div>}
        {scans.map((s, i) => (
          <div key={`${s.awb}-${s.time}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, animation: i === 0 ? 'fi .15s ease' : undefined, background: !s.success ? 'oklch(0.63 0.22 25 / .04)' : 'transparent' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: s.success ? 'oklch(0.72 0.19 145 / .12)' : 'oklch(0.63 0.22 25 / .12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {s.success ? <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.gr, strokeWidth: 2.5 }}><path d="M20 6L9 17l-5-5" /></svg>
              : <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2.5 }}><path d="M18 6L6 18M6 6l12 12" /></svg>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontFamily: T.mono, color: T.tx, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.awb}</div>
              <div style={{ fontSize: 9, color: T.tx3, marginTop: 1 }}>
                {s.time}
                {!s.success && <span style={{ color: T.re, fontWeight: 700, marginLeft: 6 }}>· DUPLICATE</span>}
                {s.success && s.state && <span style={{ color: STATE[s.state].color, fontWeight: 600, marginLeft: 6 }}>{STATE[s.state].label}</span>}
                {s.success && <ClipMarkTag mark={markOf(s.awb)} />}
              </div>
            </div>
            {s.success && i === 0 && <button type="button" className="touch44" onClick={(e) => { e.stopPropagation(); onUndo(); }} style={{ ...S.btnGhost, ...S.btnSm, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>↩ Undo</button>}
          </div>
        ))}
      </div>}
    </div>
  );
}
