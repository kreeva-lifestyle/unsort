// The desktop rail: money panel, the problem list after a failed attempt,
// then the actions — Save (the page's only gradient button), the two
// documents, Raise POs with a one-line hint on what it still needs, and a
// quiet Back / Delete footer. Sticky beside the sheet on wide screens, in
// flow on a tablet; on the phone the action block hides and CostingSaveBar
// takes over (index.css .cost-rail-actions).
import { T, S } from '../../../lib/theme';
import { CostingComponent, SheetProblem } from './costingModel';
import TotalsCard from './TotalsCard';
import SheetProblems from './SheetProblems';
import type { DocKind } from './useCostingSheet';

export default function CostingRail({ components, maintenancePct, onMaintenance, pieces, onPieces, pcs, sellingPrice, masterPrice, onSelling, errors, saved, saving, onSave, onDoc, onBack, onDelete }: {
  components: CostingComponent[];
  maintenancePct: number | string;
  onMaintenance: (v: string) => void;
  pieces: string;
  onPieces: (v: string) => void;
  pcs: number;
  sellingPrice: number | string | null | undefined;
  masterPrice: number | null;
  onSelling: (v: string) => void;
  errors: SheetProblem[];
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onDoc: (which: DocKind) => void;
  onBack: () => void;
  onDelete: () => void;
}) {
  const docBtn: React.CSSProperties = { ...S.btnGhost, minHeight: 40, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .25)' };
  // Gated buttons dim rather than disable: the tap still explains (toast).
  const hint = !(pcs > 0) ? 'Purchase plan and Raise POs need "Pieces to make"' : !saved ? 'Raise POs needs a saved sheet' : '';
  return (
    <aside className="cost-rail" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: T.rLg, padding: 14 }}>
      <TotalsCard components={components} maintenancePct={maintenancePct} onMaintenance={onMaintenance}
        pieces={pieces} onPieces={onPieces} sellingPrice={sellingPrice} masterPrice={masterPrice} onSelling={onSelling} />
      <SheetProblems problems={errors} />
      <div className="cost-rail-actions">
        <button onClick={onSave} disabled={saving}
          style={{ ...S.btnPrimary, width: '100%', minHeight: 44, fontSize: 13, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => onDoc('sheet')} style={docBtn}>Costing PDF / Share</button>
          <button onClick={() => onDoc('plan')} style={{ ...docBtn, opacity: pcs > 0 ? 1 : 0.45 }}>Purchase plan (PDF)</button>
        </div>
        <button onClick={() => onDoc('raise')} style={{ ...S.btnGhost, minHeight: 40, color: T.ac2, opacity: pcs > 0 && saved ? 1 : 0.45 }}>Raise POs</button>
        {hint && <div style={{ fontSize: 10, color: T.tx3, textAlign: 'center' }}>{hint}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <button onClick={onBack} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36 }}>← Back to list</button>
          {saved && <button onClick={onDelete} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 36 }}>Delete</button>}
        </div>
      </div>
    </aside>
  );
}
