// One pipeline on the canvas: the steps you can add (left), the board
// (middle) and the panel for whatever is selected (right) — a step, a
// connection, or nothing (= the pipeline itself, its files, save-as-template).
// The strip at the bottom counts where the pieces are.
import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import ConfirmModal, { useConfirm } from '../ui/ConfirmModal';
import FlowPalette from './FlowPalette';
import FlowBoard, { type Selection } from './FlowBoard';
import StepInspector from './StepInspector';
import PipelineInspector from './PipelineInspector';
import { useFlowPipeline } from './useFlowPipeline';
import { deletePipeline } from './flowData';
import { friendlyError } from '../../lib/friendlyError';
import { KINDS, PIPE_STATUS, tint } from './flowModel';
import { useSkuFinds } from './skuFinds';
import { useSkuPhotos } from './SkuPhotos';

export default function FlowCanvas({ id, onBack, addToast }: { id: string; onBack: () => void; addToast: (m: string, t?: string) => void }) {
  const f = useFlowPipeline(id, addToast);
  const { profile } = useAuth();
  const { ask, modalProps } = useConfirm();
  const [sel, setSel] = useState<Selection>(null);
  const step = sel?.type === 'step' ? f.steps.find(s => s.id === sel.id) ?? null : null;
  const edge = sel?.type === 'edge' ? f.edges.find(e => e.id === sel.id) ?? null : null;
  const people = [...new Set(f.steps.map(s => s.assignee).filter(Boolean))] as string[];
  const canDelete = ['admin', 'manager'].includes(profile?.role || '');
  const { finds } = useSkuFinds(f.pipeline?.sku);
  const photo = useSkuPhotos(f.pipeline?.sku, finds?.image ?? null).pics[0]?.thumb;

  if (f.error) return (
    <div className="page-pad" style={{ padding: 16 }}>
      <button type="button" onClick={onBack} style={S.btnGhost}>← Back</button>
      <div style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{f.error}</div>
    </div>
  );
  if (!f.pipeline) return <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading pipeline…</div>;
  const p = f.pipeline;
  const ps = PIPE_STATUS[p.status];

  const removeStep = async () => {
    if (!step || !await ask({ title: `Remove ${step.title || KINDS[step.kind].label}?`, message: 'Its connections go too. Linked POs and job work are not touched.', confirmLabel: 'Remove', danger: true })) return;
    setSel(null); f.removeStep(step.id);
  };
  const removePipeline = async () => {
    if (!await ask({ title: `Delete ${p.title}?`, message: 'All its steps, connections and files are deleted. Linked POs and job work stay as they are.', confirmLabel: 'Delete', danger: true })) return;
    try { await deletePipeline(p.id); addToast('Pipeline deleted', 'success'); onBack(); } catch (e) { addToast(friendlyError(e), 'error'); }
  };
  const count = (k: string) => f.steps.filter(s => s.kind === k).reduce((t, s) => t + Number(s.qty_done || 0), 0);

  return (
    <div className="page-pad flow-canvas" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: T.sans, color: T.tx }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button type="button" onClick={onBack} style={S.btnGhost}>← Flow</button>
          {photo && <img src={photo} alt={p.sku ?? ''} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: `1px solid ${T.bd}`, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.sora, fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: T.mono, color: T.tx3, fontSize: 12, marginRight: 6 }}>F-{p.flow_number}</span>{p.title}
            </div>
            <div style={{ fontSize: 11, color: T.tx3 }}>{[p.sku, p.pieces ? `${p.pieces} pcs` : null, p.sizes].filter(Boolean).join(' · ') || 'Tap the empty canvas to edit the pipeline details'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: tint(ps.color, 0.1), color: ps.color, border: `1px solid ${tint(ps.color, 0.25)}`, fontSize: 11, fontWeight: 500 }}>{ps.label}</span>
          {p.status === 'planning' && <button type="button" onClick={() => f.patchPipeline({ status: 'running' })} style={S.btnPrimary}>Start pipeline</button>}
          {p.status === 'running' && <button type="button" onClick={() => f.patchPipeline({ status: 'done' })} style={S.btnSuccess}>Mark done</button>}
        </div>
      </div>

      <div className="flow-layout" style={{ display: 'grid', gridTemplateColumns: '168px minmax(0, 1fr) 300px', gap: 10, alignItems: 'stretch', minHeight: 520 }}>
        <FlowPalette busy={f.busy} onAdd={async (kind, label) => { const nid = await f.addStepOf(kind, label); if (nid) setSel({ type: 'step', id: nid }); }} />
        <FlowBoard steps={f.steps} edges={f.edges} links={f.links} sel={sel} onSelect={setSel} onMove={f.moveStep} onConnect={f.connect} />
        <aside className="flow-inspector" aria-label="Details" style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, overflowY: 'auto', maxHeight: 'calc(100dvh - 210px)' }}>
          {step && <StepInspector step={step} sku={p.sku} steps={f.steps} edges={f.edges} links={f.links} files={f.files} people={people} addToast={addToast}
            onPatch={patch => f.patchStep(step.id, patch)} onRemove={removeStep} onFiles={f.setFiles} />}
          {edge && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Connection</span>
              <span style={{ fontSize: 11, color: T.tx3 }}>{[edge.from_step, edge.to_step].map(sid => { const s = f.steps.find(x => x.id === sid); return s ? s.title || KINDS[s.kind].label : '?'; }).join(' → ')}</span>
              <div><label style={S.fLabel} htmlFor="fe-label">What moves along it</label>
                <input id="fe-label" key={edge.id} defaultValue={edge.label ?? ''} placeholder="e.g. 36 panels" onBlur={e => { const v = e.target.value.trim(); if (v !== (edge.label ?? '')) f.labelEdge(edge.id, v); }} style={S.fInput} /></div>
              <button type="button" onClick={() => { setSel(null); f.removeEdge(edge.id); }} style={{ ...S.btnDanger, minHeight: 36 }}>Remove connection</button>
            </div>
          )}
          {!step && !edge && <PipelineInspector p={p} steps={f.steps} files={f.files} canDelete={canDelete} addToast={addToast}
            onPatch={f.patchPipeline} onFiles={f.setFiles} onSaveTemplate={f.saveTemplate} onDelete={removePipeline} onLinked={f.load} />}
        </aside>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', fontSize: 11, color: T.tx2 }}>
        <span style={{ ...S.fLabel, marginBottom: 0, fontSize: 10 }}>Pieces</span>
        {p.pieces ? <span>Planned <b style={{ fontFamily: T.mono, color: T.tx }}>{p.pieces}</b></span> : null}
        {(['cutting', 'jobwork', 'stitching', 'qc', 'stock'] as const).filter(k => f.steps.some(s => s.kind === k)).map(k => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: KINDS[k].color }} />{KINDS[k].label} <b style={{ fontFamily: T.mono, color: T.tx }}>{count(k).toLocaleString('en-IN')}</b>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: T.tx3 }}>{f.files.length ? `${f.files.length} file${f.files.length === 1 ? '' : 's'} attached` : ''}</span>
      </div>
      <ConfirmModal {...modalProps} />
    </div>
  );
}
