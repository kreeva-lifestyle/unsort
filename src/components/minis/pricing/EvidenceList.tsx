// "Evidence from your data" — the deterministic items the AI is allowed to
// reason over, each with the action it supports: use a paid rate on the
// sheet, exclude a double-counted stitching head, or open the PO.
import { T, S, alpha } from '../../../lib/theme';
import { money } from '../costing/costingModel';
import type { Evidence, EvidenceAction, EvidenceResult } from './evidence';

const COLOR: Record<Evidence['kind'], string> = {
  po_fabric_for_sku: T.bl, po_rate_vs_sheet: T.gr, po_rate_history: T.bl, po_vendor: T.bl, stale_rates: T.yl, missing_po_rates: T.tx3, consumption: T.tx2,
  double_count: T.re, placeholder_rates: T.yl, peer_structure: T.ac2,
};

export const RefChip = ({ id, dim }: { id: string; dim?: boolean }) => (
  <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '1px 6px', borderRadius: 4, background: alpha(T.ac, 0.14), color: dim ? T.tx3 : T.ac2, border: `1px solid ${alpha(T.ac, 0.25)}` }}>{id}</span>
);

export default function EvidenceList({ evidence, busy, onAction }: { evidence: EvidenceResult; busy: string | null; onAction: (a: EvidenceAction) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.tx3, fontFamily: T.mono, marginBottom: 4 }}>Evidence from your data</div>
      {evidence.items.length === 0 && <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.6 }}>Nothing to reason over yet.</div>}
      {evidence.items.map((e, i) => {
        const key = e.action ? `${e.action.type}:${e.id}` : null;
        return (
          <div key={e.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? `1px solid ${T.bd}` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: COLOR[e.kind] }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <RefChip id={e.id} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, flex: 1, minWidth: 120 }}>{e.title}</span>
                {e.impactPerPc ? <span style={{ fontFamily: T.mono, fontSize: 11, color: T.gr, flexShrink: 0 }}>−{money(e.impactPerPc)}/pc</span> : null}
              </div>
              <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5, marginTop: 2 }}>{e.detail}</div>
              {e.action && (
                <button type="button" className="touch44" disabled={!!busy} onClick={() => onAction(e.action!)}
                  style={{ ...S.btnGhost, ...S.btnSm, minHeight: 30, marginTop: 6, pointerEvents: busy ? 'none' : 'auto', opacity: busy && busy !== key ? 0.5 : 1 }}>
                  {busy === key ? 'Applying…' : e.action.label}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {evidence.missing.length > 0 && (
        <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginTop: 8, borderTop: evidence.items.length ? `1px solid ${T.bd}` : 'none', paddingTop: evidence.items.length ? 8 : 0 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: T.mono, marginBottom: 2 }}>What would unlock more</div>
          {evidence.missing.map((m, i) => <div key={i}>· {m}</div>)}
        </div>
      )}
    </div>
  );
}
