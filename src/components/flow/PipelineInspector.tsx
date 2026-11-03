// The right-hand panel when no step is selected: the pipeline itself — name,
// SKU (catalog suggestions, like Cash Challan), pieces, size split, due date,
// status, note — the design's photos and its POs / job work not on the canvas
// yet, every file attached, "Save as template", and Delete for admin / manager.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { PIPE_STATUS, KINDS } from './flowModel';
import FlowAttachments from './FlowAttachments';
import SkuInput from '../ui/SkuInput';
import SkuPanel from './SkuPanel';
import { skuKey } from './skuFinds';
import type { FlowPipeline, FlowPipelineStatus, FlowStep, FlowAttachment } from '../../types/flow';

export default function PipelineInspector({ p, steps, files, canDelete, onPatch, onFiles, onSaveTemplate, onDelete, onLinked, addToast }: {
  p: FlowPipeline;
  steps: FlowStep[];
  files: FlowAttachment[];
  canDelete: boolean;
  onPatch: (patch: Partial<FlowPipeline>) => void;
  onFiles: (next: FlowAttachment[]) => void;
  onSaveTemplate: (name: string) => Promise<void>;
  onDelete: () => void;
  /** Orders were added to the canvas: reload it. */
  onLinked: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [f, setF] = useState({ title: p.title, sku: p.sku ?? '', pieces: p.pieces?.toString() ?? '', sizes: p.sizes ?? '', notes: p.notes ?? '' });
  const [tpl, setTpl] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF({ title: p.title, sku: p.sku ?? '', pieces: p.pieces?.toString() ?? '', sizes: p.sizes ?? '', notes: p.notes ?? '' }); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const blur = (key: 'title' | 'sku' | 'sizes' | 'notes') => () => {
    const v = key === 'sku' ? skuKey(f.sku) : f[key].trim();
    if (key === 'title' && !v) { addToast('The pipeline needs a name', 'error'); setF({ ...f, title: p.title }); return; }
    if (v !== ((p[key] as string | null) ?? '')) onPatch({ [key]: key === 'title' ? v : v || null });
  };
  const stepNames = Object.fromEntries(steps.map(s => [s.id, s.title || KINDS[s.kind].label]));
  const saveTpl = async () => {
    if (!tpl.trim() || saving) return;
    setSaving(true);
    try { await onSaveTemplate(tpl); setTpl(''); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 11, color: T.tx3 }}>Tap a step on the canvas to edit it. This panel is the whole pipeline.</span>
      <div><label style={S.fLabel} htmlFor="fp-title">Pipeline name *</label>
        <input id="fp-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onBlur={blur('title')} style={S.fInput} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div><label style={S.fLabel} htmlFor="fp-sku">SKU</label>
          <div onBlur={blur('sku')}><SkuInput id="fp-sku" value={f.sku} sizes={false} onChange={v => setF(prev => ({ ...prev, sku: v }))}
            onPick={prod => { if (prod.sku !== (p.sku ?? '')) onPatch({ sku: prod.sku }); }} style={{ ...S.fInput, fontFamily: T.mono }} /></div></div>
        <div><label style={S.fLabel} htmlFor="fp-pcs">Pieces</label>
          <input id="fp-pcs" inputMode="numeric" value={f.pieces} onKeyDown={e => numericKeyDown(e)} onChange={e => setF({ ...f, pieces: e.target.value.replace(/\D/g, '') })}
            onBlur={() => { const n = parseInt(f.pieces, 10); const v = isNaN(n) || n <= 0 ? null : n; if (v !== p.pieces) onPatch({ pieces: v }); }} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
      </div>
      <div><label style={S.fLabel} htmlFor="fp-sizes">Size split</label>
        <input id="fp-sizes" value={f.sizes} onChange={e => setF({ ...f, sizes: e.target.value })} onBlur={blur('sizes')} placeholder="S 6 · M 9 · L 10 · XL 8 · XXL 3" style={S.fInput} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div><label style={S.fLabel} htmlFor="fp-status">Status</label>
          <select id="fp-status" value={p.status} onChange={e => onPatch({ status: e.target.value as FlowPipelineStatus })} style={S.fInput}>
            {(Object.keys(PIPE_STATUS) as FlowPipelineStatus[]).map(s => <option key={s} value={s}>{PIPE_STATUS[s].label}</option>)}
          </select></div>
        <div><label style={S.fLabel} htmlFor="fp-due">Due</label>
          <input id="fp-due" type="date" value={p.due_date ?? ''} onChange={e => onPatch({ due_date: e.target.value || null })} style={S.fDate} /></div>
      </div>
      <div><label style={S.fLabel} htmlFor="fp-notes">Note</label>
        <textarea id="fp-notes" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} onBlur={blur('notes')} style={{ ...S.fInput, height: 'auto', minHeight: 56, resize: 'vertical' }} /></div>
      <SkuPanel pipelineId={p.id} sku={p.sku} linkedIds={new Set(steps.flatMap(s => [s.po_id, s.jobwork_order_id]).filter(Boolean) as string[])} onLinked={onLinked} addToast={addToast} />
      <FlowAttachments pipelineId={p.id} stepId={null} files={files} stepNames={stepNames} onChange={onFiles} addToast={addToast} />
      <div><label style={S.fLabel} htmlFor="fp-tpl">Save these steps as a template</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input id="fp-tpl" value={tpl} onChange={e => setTpl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveTpl(); }} placeholder="e.g. Lehenga · embroidery + tailor" style={S.fInput} />
          <button type="button" onClick={saveTpl} disabled={!tpl.trim() || steps.length === 0} style={{ ...S.btnGhost, minHeight: 36, pointerEvents: saving ? 'none' : 'auto', opacity: saving || !tpl.trim() || steps.length === 0 ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div></div>
      {canDelete && <button type="button" onClick={onDelete} style={{ ...S.btnDanger, minHeight: 36 }}>Delete pipeline</button>}
    </div>
  );
}
