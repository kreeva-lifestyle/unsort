// New Flow pipeline: name, SKU, pieces, size split, due date and a template to
// start from (or a blank canvas). flow_create() makes the pipeline and copies
// the template's steps and connections in one go; the canvas opens next.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import { createPipeline, listTemplates } from './flowData';
import type { FlowTemplate } from '../../types/flow';

export default function NewFlowModal({ onClose, onCreated, addToast }: { onClose: () => void; onCreated: (id: string) => void; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState({ title: '', sku: '', pieces: '', sizes: '', due: '', template: '' });
  const [templates, setTemplates] = useState<FlowTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useModalLock();
  useBackClose(true, onClose);

  useEffect(() => {
    let alive = true;
    listTemplates().then(t => { if (!alive) return; setTemplates(t); if (t[0]) setF(prev => ({ ...prev, template: prev.template || t[0].id })); })
      .catch(e => { if (alive) { setTemplates([]); setError(friendlyError(e)); } });
    return () => { alive = false; };
  }, []);

  const save = async () => {
    if (saving) return;
    if (!f.title.trim()) { setError('Give the pipeline a name — e.g. "DRS241 lehenga · Nov batch"'); return; }
    const pieces = f.pieces ? parseInt(f.pieces, 10) : null;
    if (pieces !== null && !(pieces > 0)) { setError('Pieces must be a whole number above 0'); return; }
    setSaving(true); setError('');
    try {
      const id = await createPipeline({ title: f.title.trim(), sku: f.sku.trim(), pieces, sizes: f.sizes.trim(), due_date: f.due || null }, f.template || null);
      addToast(`Pipeline "${f.title.trim()}" created`, 'success');
      onCreated(id);
    } catch (e) { setError(friendlyError(e)); setSaving(false); }
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={S.modalBox} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>New Flow Pipeline</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={S.fLabel} htmlFor="nf-title">Name *</label>
            <input id="nf-title" autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} onKeyDown={enter} placeholder="DRS241 lehenga · Nov batch" style={S.fInput} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div><label style={S.fLabel} htmlFor="nf-sku">SKU</label>
              <input id="nf-sku" value={f.sku} onChange={e => setF({ ...f, sku: e.target.value.toUpperCase() })} onKeyDown={enter} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
            <div><label style={S.fLabel} htmlFor="nf-pcs">Pieces</label>
              <input id="nf-pcs" inputMode="numeric" value={f.pieces} onKeyDown={e => { numericKeyDown(e); enter(e); }} onChange={e => setF({ ...f, pieces: e.target.value.replace(/\D/g, '') })} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
          </div>
          <div><label style={S.fLabel} htmlFor="nf-sizes">Size split</label>
            <input id="nf-sizes" value={f.sizes} onChange={e => setF({ ...f, sizes: e.target.value })} onKeyDown={enter} placeholder="S 6 · M 9 · L 10 · XL 8 · XXL 3" style={S.fInput} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div><label style={S.fLabel} htmlFor="nf-due">Due</label>
              <input id="nf-due" type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} style={{ ...S.fDate, width: '100%' }} /></div>
            <div><label style={S.fLabel} htmlFor="nf-tpl">Start from</label>
              <select id="nf-tpl" value={f.template} onChange={e => setF({ ...f, template: e.target.value })} style={S.fInput} disabled={templates === null}>
                {templates === null && <option value="">Loading templates…</option>}
                {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="">Blank canvas</option>
              </select></div>
          </div>
          {f.template && templates && (
            <div style={{ fontSize: 11, color: T.tx3 }}>{(templates.find(t => t.id === f.template)?.graph.steps || []).map(s => s.title).join(' → ')}</div>
          )}
          {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btnGhost}>Cancel</button>
            <button type="button" onClick={save} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Creating…' : 'Create & open'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
