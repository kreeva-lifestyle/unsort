// One photo card in the Index maker editor: thumbnail, SKU box, reorder and
// remove. Kept dumb — the list owns the state.
import { T, S } from '../../../lib/theme';

export interface DraftTile { id: string; file: File; url: string; sku: string }

export default function IndexTile({ tile, index, count, duplicate, onSku, onMove, onRemove }: {
  tile: DraftTile;
  index: number;
  count: number;
  duplicate: boolean;
  onSku: (v: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const nav = (dir: -1 | 1, label: string) => {
    const off = dir === -1 ? index === 0 : index === count - 1;
    return (
      <button type="button" onClick={() => onMove(dir)} disabled={off} aria-label={label}
        style={{ ...S.btnGhost, ...S.btnSm, minWidth: 36, minHeight: 32, padding: '4px 8px', opacity: off ? 0.3 : 1 }}>{dir === -1 ? '‹' : '›'}</button>
    );
  };
  const bad = !tile.sku.trim() || duplicate;
  return (
    <div style={{ border: `1px solid ${bad ? 'oklch(0.63 0.22 25 / .45)' : T.bd}`, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '2 / 3', background: T.s2 }}>
        <img src={tile.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <span style={{ position: 'absolute', top: 6, left: 6, fontSize: 10, fontFamily: T.mono, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 7px', borderRadius: 4 }}>{index + 1}</span>
        <button type="button" onClick={onRemove} aria-label="Remove photo"
          style={{ position: 'absolute', top: 4, right: 4, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>&times;</button>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input value={tile.sku} onChange={e => onSku(e.target.value)} placeholder="SKU *" aria-label={`SKU for photo ${index + 1}`}
          style={{ ...S.fInput, width: '100%', fontFamily: T.mono, textTransform: 'uppercase', textAlign: 'center', borderColor: bad ? 'oklch(0.63 0.22 25 / .5)' : undefined }} />
        {duplicate && <div style={{ fontSize: 10, color: T.yl, textAlign: 'center' }}>Same SKU on another photo</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
          {nav(-1, 'Move earlier')}
          {nav(1, 'Move later')}
        </div>
      </div>
    </div>
  );
}
