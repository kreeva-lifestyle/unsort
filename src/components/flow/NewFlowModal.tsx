// New Flow pipeline. Type the SKU the way Cash Challan does (suggestions from
// the catalog) and the rest fills itself: a name, the closest template, the
// design's photos, the pieces its open PO was planned for, and every PO and
// job work raised for that design — open ones ticked, and linked into the
// right steps on Create. flow_create() makes the pipeline and copies the
// template's steps and connections in one go; the canvas opens next.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import SkuInput from '../ui/SkuInput';
import SkuPhotos from './SkuPhotos';
import SkuOrders from './SkuOrders';
import { createPipeline, listTemplates } from './flowData';
import { useSkuFinds, suggestPieces } from './skuFinds';
import { linkOrders } from './autoLink';
import type { FlowTemplate } from '../../types/flow';
import type { Product } from '../../hooks/useProductCatalog';

// "Lehenga · embroidery + tailor" is picked for a design whose name, category
// or parts mention "lehenga".
const guessTemplate = (ts: FlowTemplate[], p: Product) => {
  const words = [p.title, p.category, ...p.includes].join(' ').toLowerCase();
  return ts.find(t => { const w = t.name.split('·')[0].trim().split(' ')[0].toLowerCase(); return w.length > 2 && words.includes(w); })?.id;
};

export default function NewFlowModal({ onClose, onCreated, addToast }: { onClose: () => void; onCreated: (id: string) => void; addToast: (m: string, t?: string) => void }) {
  const [f, setF] = useState({ title: '', sku: '', pieces: '', sizes: '', due: '', template: '' });
  const [touched, setTouched] = useState({ title: false, pieces: false, template: false });
  const [templates, setTemplates] = useState<FlowTemplate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { real, key, finds, error: findErr } = useSkuFinds(f.sku);
  useModalLock();
  useBackClose(true, onClose);

  useEffect(() => {
    let alive = true;
    listTemplates().then(t => { if (!alive) return; setTemplates(t); if (t[0]) setF(prev => ({ ...prev, template: prev.template || t[0].id })); })
      .catch(e => { if (alive) { setTemplates([]); setError(friendlyError(e)); } });
    return () => { alive = false; };
  }, []);

  // The SKU's orders arrived: tick the open ones, and offer the planned pieces.
  useEffect(() => {
    if (!finds) { setPicked(new Set()); return; }
    setPicked(new Set(finds.orders.filter(o => o.open).map(o => o.id)));
    const n = suggestPieces(finds);
    if (n && !touched.pieces) setF(prev => ({ ...prev, pieces: String(n) }));
  }, [finds]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (p: Product) => {
    setF(prev => ({
      ...prev,
      title: touched.title ? prev.title : [p.sku, p.title].filter(Boolean).join(' · '),
      template: touched.template || !templates ? prev.template : guessTemplate(templates, p) ?? prev.template,
    }));
  };
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    if (saving) return;
    if (!f.title.trim()) { setError('Give the pipeline a name — or pick a SKU and it is named for you'); return; }
    const pieces = f.pieces ? parseInt(f.pieces, 10) : null;
    if (pieces !== null && !(pieces > 0)) { setError('Pieces must be a whole number above 0'); return; }
    setSaving(true); setError('');
    try {
      const id = await createPipeline({ title: f.title.trim(), sku: key || f.sku.trim(), pieces, sizes: f.sizes.trim(), due_date: f.due || null, costing_product_id: finds?.costingId ?? null }, f.template || null);
      const orders = (finds?.orders || []).filter(o => picked.has(o.id));
      if (orders.length) {
        const r = await linkOrders(id, orders).catch(e => ({ linked: 0, failed: e }));
        if (r.failed) addToast(`Pipeline created, but some orders could not be linked — ${friendlyError(r.failed)}`, 'error');
        else addToast(`Pipeline created · ${r.linked} order${r.linked === 1 ? '' : 's'} linked`, 'success');
      } else addToast(`Pipeline "${f.title.trim()}" created`, 'success');
      onCreated(id);
    } catch (e) { setError(friendlyError(e)); setSaving(false); }
  };
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') save(); };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>New Flow Pipeline</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={S.fLabel} htmlFor="nf-sku">SKU</label>
            <SkuInput id="nf-sku" autoFocus value={f.sku} sizes={false} onChange={v => setF(prev => ({ ...prev, sku: v }))} onPick={onPick}
              placeholder="Type the design — e.g. DRS241" style={{ ...S.fInput, fontFamily: T.mono }} /></div>
          {real && <SkuPhotos sku={key} costingImage={finds?.image ?? null} />}
          <div><label style={S.fLabel} htmlFor="nf-title">Name *</label>
            <input id="nf-title" value={f.title} onChange={e => { setF({ ...f, title: e.target.value }); setTouched(t => ({ ...t, title: true })); }} onKeyDown={enter} placeholder="Fills in from the SKU" style={S.fInput} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div><label style={S.fLabel} htmlFor="nf-pcs">Pieces</label>
              <input id="nf-pcs" inputMode="numeric" value={f.pieces} onKeyDown={e => { numericKeyDown(e); enter(e); }} onChange={e => { setF({ ...f, pieces: e.target.value.replace(/\D/g, '') }); setTouched(t => ({ ...t, pieces: true })); }} style={{ ...S.fInput, fontFamily: T.mono }} /></div>
            <div><label style={S.fLabel} htmlFor="nf-due">Due</label>
              <input id="nf-due" type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} style={{ ...S.fDate, width: '100%' }} /></div>
          </div>
          <div><label style={S.fLabel} htmlFor="nf-sizes">Size split</label>
            <input id="nf-sizes" value={f.sizes} onChange={e => setF({ ...f, sizes: e.target.value })} onKeyDown={enter} placeholder="S 6 · M 9 · L 10 · XL 8 · XXL 3" style={S.fInput} /></div>
          <div><label style={S.fLabel} htmlFor="nf-tpl">Steps</label>
            <select id="nf-tpl" value={f.template} onChange={e => { setF({ ...f, template: e.target.value }); setTouched(t => ({ ...t, template: true })); }} style={S.fInput} disabled={templates === null}>
              {templates === null && <option value="">Loading templates…</option>}
              {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="">Blank canvas</option>
            </select>
            {f.template && templates && <div style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>{(templates.find(t => t.id === f.template)?.graph.steps || []).map(s => s.title).join(' → ')}</div>}
          </div>
          {real && <SkuOrders mode="pick" sku={key} orders={finds?.orders ?? null} error={findErr} picked={picked} onToggle={toggle} />}
          {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={S.btnGhost}>Cancel</button>
            <button type="button" onClick={save} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Creating…' : picked.size ? `Create & link ${picked.size}` : 'Create & open'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
