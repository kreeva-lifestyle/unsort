// PackStation → Scan History: the three stat tiles above the list
// (moved out of PackTime.tsx unchanged).
import { T } from '../../lib/theme';
import type { PackTimeScan } from '../../types/database';

const tile: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '14px 16px', position: 'relative', overflow: 'hidden' };
const label: React.CSSProperties = { fontSize: 9, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 };

function Tile({ title, value, color, from, to }: { title: string; value: number; color: string; from: string; to: string }) {
  return (
    <div style={tile}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${from}, ${to})` }} />
      <div style={label}>{title}</div>
      <div style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function HistoryStats({ total, rows }: { total: number; rows: PackTimeScan[] }) {
  const today = new Date().toDateString();
  return (
    <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
      <Tile title="Total Scans" value={total} color={T.ac2} from={T.ac87} to={T.ac22} />
      <Tile title="Today" value={rows.filter(r => r.scanned_at && new Date(r.scanned_at).toDateString() === today).length} color={T.gr} from={T.grCC} to={T.gr22} />
      <Tile title="Couriers" value={new Set(rows.map(r => r.courier)).size} color={T.yl} from={T.ylCC} to={T.yl22} />
    </div>
  );
}
