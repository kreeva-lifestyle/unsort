// The right-hand panel for one step: what it is, who does it, how much is
// planned and done, its status and due date, the PO / job work it is linked
// to, what it waits for, its files, and Remove. Text saves when you leave the
// field; choices save at once.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import { KINDS, STEP_STATUS, tint } from './flowModel';
import LinkPicker from './LinkPicker';
import FlowAttachments from './FlowAttachments';
import type { FlowStep, FlowEdge, FlowAttachment, FlowStepStatus } from '../../types/flow';
import type { LinkInfo } from './flowData';

const label = S.fLabel;

export default function StepInspector({ step, steps, edges, links, files, people, onPatch, onRemove, onFiles, addToast }: {
  step: FlowStep;
  steps: FlowStep[];
  edges: FlowEdge[];
  links: Record<string, LinkInfo>;
  files: FlowAttachment[];
  /** Names already used on other steps — offered as you type "Who". */
  people: string[];
  onPatch: (patch: Partial<FlowStep>) => void;
  onRemove: () => void;
  onFiles: (next: FlowAttachment[]) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const k = KINDS[step.kind];
  const [f, setF] = useState({ title: step.title, assignee: step.assignee ?? '', planned: step.qty_planned?.toString() ?? '', done: String(step.qty_done ?? 0), unit: step.unit ?? '', notes: step.notes ?? '' });
  useEffect(() => {
    setF({ title: step.title, assignee: step.assignee ?? '', planned: step.qty_planned?.toString() ?? '', done: String(step.qty_done ?? 0), unit: step.unit ?? '', notes: step.notes ?? '' });
  }, [step.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (v: string) => { const n = parseFloat(v); return isNaN(n) || n < 0 ? null : Math.round(n * 1000) / 1000; };
  const blurText = (key: 'title' | 'assignee' | 'notes' | 'unit') => () => {
    const v = f[key].trim();
    if (v !== ((step[key] as string | null) ?? '')) onPatch({ [key]: key === 'title' ? v : v || null });
  };
  const waitsFor = edges.filter(e => e.to_step === step.id).map(e => steps.find(s => s.id === e.from_step)).filter(Boolean) as FlowStep[];
  const linkKind = step.kind === 'po' ? 'po' : step.kind === 'jobwork' ? 'jobwork' : null;
  const linkId = linkKind === 'po' ? step.po_id : step.jobwork_order_id;
  const stepNames = Object.fromEntries(steps.map(s => [s.id, s.title || KINDS[s.kind].label]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: tint(k.color, 0.12), color: k.color, border: `1px solid ${tint(k.color, 0.25)}`, fontSize: 11, fontWeight: 500 }}>{k.label}</span>
      <div><label style={label} htmlFor="fs-title">Name</label>
        <input id="fs-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onBlur={blurText('title')} placeholder={k.label} style={S.fInput} /></div>
      {linkKind && <div><span style={label}>Linked {linkKind === 'po' ? 'purchase order' : 'job work'}</span>
        <LinkPicker kind={linkKind} linkedId={linkId} info={linkId ? links[linkId] ?? null : null} addToast={addToast}
          onPick={id => onPatch(linkKind === 'po' ? { po_id: id } : { jobwork_order_id: id })} /></div>}
      <div><label style={label} htmlFor="fs-who">{step.kind === 'stitching' ? 'Tailor' : step.kind === 'cutting' ? 'Cutting master' : 'Who does it'}</label>
        <input id="fs-who" list="flow-people" value={f.assignee} onChange={e => setF({ ...f, assignee: e.target.value })} onBlur={blurText('assignee')} placeholder={step.kind === 'jobwork' || step.kind === 'po' ? 'Vendor' : 'Name'} style={S.fInput} />
        <datalist id="flow-people">{people.map(p => <option key={p} value={p} />)}</datalist></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <div><label style={label} htmlFor="fs-plan">Planned</label>
          <input id="fs-plan" inputMode="decimal" value={f.planned} onKeyDown={e => numericKeyDown(e)} onChange={e => setF({ ...f, planned: e.target.value })}
            onBlur={() => { const v = num(f.planned); if (v !== (step.qty_planned ?? null)) onPatch({ qty_planned: v }); }} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
        <div><label style={label} htmlFor="fs-done">Done</label>
          <input id="fs-done" inputMode="decimal" value={f.done} onKeyDown={e => numericKeyDown(e)} onChange={e => setF({ ...f, done: e.target.value })}
            onBlur={() => { const v = num(f.done) ?? 0; if (v !== Number(step.qty_done)) onPatch({ qty_done: v, ...(step.qty_planned && v >= Number(step.qty_planned) ? { status: 'done' as const } : v > 0 && step.status === 'planned' ? { status: 'active' as const } : {}) }); }} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
        <div><label style={label} htmlFor="fs-unit">Unit</label>
          <input id="fs-unit" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} onBlur={blurText('unit')} placeholder={k.unit} style={S.fInput} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div><label style={label} htmlFor="fs-status">Status</label>
          <select id="fs-status" value={step.status} onChange={e => onPatch({ status: e.target.value as FlowStepStatus })} style={S.fInput}>
            {(Object.keys(STEP_STATUS) as FlowStepStatus[]).map(s => <option key={s} value={s}>{STEP_STATUS[s].label}</option>)}
          </select></div>
        <div><label style={label} htmlFor="fs-due">Due</label>
          <input id="fs-due" type="date" value={step.due_date ?? ''} onChange={e => onPatch({ due_date: e.target.value || null })} style={S.fDate} /></div>
      </div>
      <div><span style={label}>Starts when</span>
        {waitsFor.length === 0 && <div style={{ fontSize: 11, color: T.tx3 }}>Nothing before it — it can start any time.</div>}
        {waitsFor.map(w => (
          <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ color: T.tx2 }}>{w.title || KINDS[w.kind].label}</span><span style={{ color: STEP_STATUS[w.status].color }}>{STEP_STATUS[w.status].label}</span>
          </div>
        ))}
      </div>
      <div><label style={label} htmlFor="fs-notes">Note</label>
        <textarea id="fs-notes" rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} onBlur={blurText('notes')} placeholder="Anything the next person should know" style={{ ...S.fInput, height: 'auto', minHeight: 56, resize: 'vertical' }} /></div>
      <FlowAttachments pipelineId={step.pipeline_id} stepId={step.id} files={files} stepNames={stepNames} onChange={onFiles} addToast={addToast} />
      <button type="button" onClick={onRemove} style={{ ...S.btnDanger, minHeight: 36 }}>Remove step</button>
    </div>
  );
}
