// The phone's fixed bottom bar (index.css .cost-savebar, the challan
// savebar geometry): cost/pc with the margin under the thumb the whole time,
// "N to fix ›" after a failed attempt (tap → a sheet of the problems, each
// row jumping to its field), a ⋯ More sheet for the documents, POs, Back and
// Delete, and Save. Rendered IN FLOW (not portaled): the app keeps visited
// tabs mounted but hidden, and a bar on <body> would stay on screen over
// other tabs. body.modal-open hides it under any bottom sheet.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import ActionSheet, { type SheetAction } from '../../ui/ActionSheet';
import { SheetProblem, money } from './costingModel';
import { jumpTo } from './SheetProblems';
import type { DocKind } from './useCostingSheet';

export default function CostingSaveBar({ sku, total, sell, pcs, errors, saved, saving, deleting, onSave, onDoc, onBack, onDelete, onJump = jumpTo }: {
  sku: string;
  total: number;
  sell: number;
  pcs: number;
  errors: SheetProblem[];
  saved: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onDoc: (which: DocKind) => void;
  onBack: () => void;
  onDelete: () => void;
  /** Reveal-then-jump for layouts whose fields live in other views (phone). */
  onJump?: (target: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const margin = sell > 0 ? (sell - total) / sell * 100 : null;
  const more: SheetAction[] = [
    { label: 'Costing PDF / Share', color: T.bl, onClick: () => onDoc('sheet') },
    { label: 'Purchase plan (PDF)', color: pcs > 0 ? T.bl : T.tx3, onClick: () => onDoc('plan') },
    { label: 'Raise POs', color: pcs > 0 && saved ? T.ac2 : T.tx3, onClick: () => onDoc('raise') },
    { label: 'Back to list', onClick: onBack },
    ...(saved ? [{ label: deleting ? 'Deleting…' : 'Delete costing', danger: true, onClick: () => { if (!deleting) onDelete(); } }] : []),
  ];
  return (<>
    <div className="cost-savebar">
      <div role={errors.length ? 'button' : undefined} onClick={errors.length ? () => setFixOpen(true) : undefined} aria-label={errors.length ? `${errors.length} to fix — show them` : undefined}
        style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', cursor: errors.length ? 'pointer' : 'default' }}>
        <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Cost / pc{margin != null && <span style={{ color: margin >= 0 ? T.gr : T.re, textTransform: 'none', letterSpacing: 0 }}> · {margin.toFixed(1)}% margin</span>}
        </div>
        <div style={{ fontFamily: T.sora, fontWeight: 800, fontSize: 17, color: T.ac2, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {money(total)}{errors.length > 0 && <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: T.re }}> · {errors.length} to fix ›</span>}
        </div>
      </div>
      <button type="button" onClick={() => setMoreOpen(true)} aria-label="More actions"
        style={{ ...S.btnGhost, width: 44, height: 44, padding: 0, fontSize: 18, flexShrink: 0 }}>⋯</button>
      <button onClick={onSave} disabled={saving}
        style={{ ...S.btnPrimary, minHeight: 44, minWidth: 112, fontSize: 13, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
    <ActionSheet open={moreOpen} title={sku.trim().toUpperCase() || 'New costing'} subtitle={`${money(total)} / pc${pcs > 0 ? ` · × ${pcs} pcs` : ''}`} actions={more} onClose={() => setMoreOpen(false)} />
    <ActionSheet open={fixOpen} title="Fix before saving" subtitle={`${errors.length} thing${errors.length === 1 ? '' : 's'} — tap one`}
      actions={errors.slice(0, 8).map(e => ({ label: e.msg, color: T.re, onClick: () => onJump(e.target) }))} onClose={() => setFixOpen(false)} />
  </>);
}
