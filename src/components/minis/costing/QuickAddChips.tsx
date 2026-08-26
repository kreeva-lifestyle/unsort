// "Template" quick-build (owner's ask): pre-built chips of main-component
// names — the house defaults plus every name used on earlier costings — one
// tap adds that component to the sheet. Chips already on the sheet hide.
// The plain button still adds an unnamed component.
import { S } from '../../../lib/theme';

const DEFAULTS = ['Fabric', 'Lining', 'Stitching', 'Embroidery', 'Packing'];

export default function QuickAddChips({ existing, known, onAdd }: {
  existing: string[];
  known: string[];
  onAdd: (name: string) => void;
}) {
  const used = new Set(existing.map(n => n.trim().toUpperCase()).filter(Boolean));
  const chips = [...new Set([...DEFAULTS, ...known.map(n => n.trim()).filter(Boolean)])]
    .filter(n => !used.has(n.toUpperCase())).slice(0, 12);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <button onClick={() => onAdd('')} style={{ ...S.btnPrimary, minHeight: 40 }}>+ Add main component</button>
      {chips.map(n => (
        <button key={n} onClick={() => onAdd(n)} aria-label={`Add ${n} component`}
          style={{ ...S.btnGhost, minHeight: 32, padding: '5px 12px', fontSize: 11, borderRadius: 999 }}>
          + {n}
        </button>
      ))}
    </div>
  );
}
