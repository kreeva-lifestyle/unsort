// One-tap chips of the MOST-REPEATED sub-components across all costings
// (owner's call: mains don't need chips, subs do). The ranking is computed
// by a pg_cron job every 4 days into app_settings.costing_top_subs — the
// app only displays it. Tapping adds the sub pre-filled with its usual unit
// and suppliers (with material codes); rates stay BLANK on purpose — house
// rule: a stale rate never silently prices a sheet. Chips already present
// in this component hide.
import { S } from '../../../lib/theme';
import { CostingComponent, CostingSub, blankSupplier } from './costingModel';

export interface SubPreset { name: string; unit: string; suppliers: { name: string; materialCode: string }[] }

export default function SubChips({ presets, comp, onAdd }: {
  presets: SubPreset[];
  comp: CostingComponent;
  onAdd: (s: CostingSub) => void;
}) {
  const used = new Set(comp.subs.map(s => s.name.trim().toUpperCase()).filter(Boolean));
  const chips = presets.filter(p => p.name.trim() && !used.has(p.name.trim().toUpperCase())).slice(0, 8);
  if (chips.length === 0) return null;
  const toSub = (p: SubPreset): CostingSub => ({
    name: p.name, qty: '', unit: p.unit,
    suppliers: p.suppliers.length
      ? p.suppliers.map((x, i) => ({ name: x.name, materialCode: x.materialCode, rate: '', selected: i === 0 }))
      : [blankSupplier()],
  });
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {chips.map(p => (
        <button key={p.name} onClick={() => onAdd(toSub(p))} aria-label={`Add ${p.name}`}
          style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, padding: '5px 12px', fontSize: 11, borderRadius: 999 }}>
          + {p.name}
        </button>
      ))}
    </div>
  );
}
