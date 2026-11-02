// State and writes for one open Flow pipeline. Every change shows at once
// (optimistic) and is saved straight away; a failed save says why and reloads
// the pipeline so the screen never shows something the database does not have.
import { useCallback, useEffect, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import * as db from './flowData';
import { KINDS, freeSpot } from './flowModel';
import type { FlowPipeline, FlowStep, FlowEdge, FlowAttachment, FlowKind } from '../../types/flow';

export function useFlowPipeline(id: string, addToast: (m: string, t?: string) => void) {
  const [pipeline, setPipeline] = useState<FlowPipeline | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [files, setFiles] = useState<FlowAttachment[]>([]);
  const [links, setLinks] = useState<Record<string, db.LinkInfo>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await db.loadPipeline(id);
      setPipeline(r.pipeline); setSteps(r.steps); setEdges(r.edges); setFiles(r.files); setError('');
      setLinks(await db.loadLinks(r.steps));
    } catch (e) { setError(friendlyError(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const fail = (e: unknown) => { addToast(friendlyError(e), 'error'); load(); };

  const patchStep = async (sid: string, patch: Partial<FlowStep>) => {
    const next = steps.map(s => (s.id === sid ? { ...s, ...patch } : s));
    setSteps(next);
    try {
      await db.updateStep(sid, patch);
      if ('po_id' in patch || 'jobwork_order_id' in patch) setLinks(await db.loadLinks(next));
    } catch (e) { fail(e); }
  };
  const moveStep = (sid: string, x: number, y: number) => patchStep(sid, { x, y });

  const addStepOf = async (kind: FlowKind, label: string): Promise<string | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const at = freeSpot(steps);
      const s = await db.addStep(id, kind, label, at.x, at.y, KINDS[kind].unit);
      setSteps(prev => [...prev, s]);
      return s.id;
    } catch (e) { fail(e); return null; } finally { setBusy(false); }
  };
  const removeStep = async (sid: string) => {
    setSteps(prev => prev.filter(s => s.id !== sid));
    setEdges(prev => prev.filter(e => e.from_step !== sid && e.to_step !== sid));
    try { await db.deleteStep(sid); addToast('Step removed', 'success'); } catch (e) { fail(e); }
  };

  const connect = async (from: string, to: string) => {
    if (edges.some(e => e.from_step === from && e.to_step === to)) { addToast('These two steps are already joined', 'error'); return; }
    try { const e = await db.addEdge(id, from, to); setEdges(prev => [...prev, e]); } catch (e) { fail(e); }
  };
  const labelEdge = async (eid: string, label: string) => {
    setEdges(prev => prev.map(e => (e.id === eid ? { ...e, label: label || null } : e)));
    try { await db.updateEdge(eid, label || null); } catch (e) { fail(e); }
  };
  const removeEdge = async (eid: string) => {
    setEdges(prev => prev.filter(e => e.id !== eid));
    try { await db.deleteEdge(eid); } catch (e) { fail(e); }
  };

  const patchPipeline = async (patch: Partial<FlowPipeline>) => {
    setPipeline(p => (p ? { ...p, ...patch } : p));
    try { await db.updatePipeline(id, patch); } catch (e) { fail(e); }
  };
  const saveTemplate = async (name: string) => {
    try { await db.saveTemplate(name, steps, edges); addToast(`Template "${name.trim()}" saved`, 'success'); }
    catch (e) { addToast(friendlyError(e), 'error'); }
  };

  return { pipeline, steps, edges, files, setFiles, links, error, busy, load, patchStep, moveStep, addStepOf, removeStep, connect, labelEdge, removeEdge, patchPipeline, saveTemplate };
}
