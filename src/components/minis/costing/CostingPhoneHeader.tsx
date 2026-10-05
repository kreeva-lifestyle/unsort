// Phone editor header: a compact identity card (thumb · SKU · category ·
// counts) with a ✎ that opens a bottom sheet for the photo, SKU and
// category — the three fields nobody edits twice, so they stop taking a
// quarter of the screen. The sheet carries the same ids the problem list
// jumps to (cost-f-sku / cost-f-category), so CostingPhone opens it first.
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import { CostingProduct } from './costingModel';
import { thumbUrl } from './costingThumbs';

interface Props {
  p: CostingProduct;
  uploading: boolean;
  categories: string[];
  problems: { sku: boolean; category: boolean };
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSku: (v: string) => void;
  onCategory: (v: string) => void;
  onFile: (f: File | undefined) => void;
}

export default function CostingPhoneHeader({ p, uploading, categories, problems, open, onOpen, onClose, onSku, onCategory, onFile }: Props) {
  const lines = p.components.reduce((t, c) => t + c.subs.length, 0);
  const sku = p.sku.trim().toUpperCase();
  return (<>
    <div onClick={onOpen} role="button" aria-label="Edit photo, SKU and category"
      style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: `1px solid ${problems.sku || problems.category ? 'oklch(0.63 0.22 25 / .45)' : T.bd}`, borderRadius: T.rXl, padding: '10px 12px', minHeight: 68, cursor: 'pointer' }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.image_url ? <img src={thumbUrl(p.image_url) || p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 9, color: T.tx3 }}>no photo</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: sku ? T.tx : T.re, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sku || 'SKU needed'}</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: `1px solid ${p.category ? T.bd2 : 'oklch(0.63 0.22 25 / .45)'}`, color: p.category ? T.tx2 : T.re, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.category || 'Category *'}</span>
        </div>
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>{p.components.length} component{p.components.length === 1 ? '' : 's'} · {lines} line{lines === 1 ? '' : 's'}{uploading ? ' · uploading photo…' : ''}</div>
      </div>
      <span aria-hidden style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ac2, fontSize: 16, flexShrink: 0 }}>✎</span>
    </div>
    {open && <EditSheet p={p} uploading={uploading} categories={categories} onClose={onClose} onSku={onSku} onCategory={onCategory} onFile={onFile} />}
  </>);
}

function EditSheet({ p, uploading, categories, onClose, onSku, onCategory, onFile }: Pick<Props, 'p' | 'uploading' | 'categories' | 'onClose' | 'onSku' | 'onCategory' | 'onFile'>) {
  useModalLock();
  useBackClose(true, onClose);
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Product</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label title="Tap to add or replace the product photo" style={{ width: 96, height: 96, borderRadius: 12, border: `1.5px dashed ${T.bd2}`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', alignSelf: 'center' }}>
            <input type="file" accept="image/*" style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            {p.image_url && !uploading
              ? <img src={p.image_url} alt={p.sku || 'product'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 10, color: T.tx3, textAlign: 'center', lineHeight: 1.4 }}>{uploading ? 'Uploading…' : '+ photo'}</span>}
          </label>
          <div>
            <label style={S.fLabel}>SKU <span style={{ color: T.re }}>*</span></label>
            <input id="cost-f-sku" value={p.sku} onChange={e => onSku(e.target.value)} placeholder="e.g. DRS243" enterKeyHint="done"
              style={{ ...S.fInput, height: 44, textTransform: 'uppercase', fontFamily: T.mono, fontWeight: 700 }} />
          </div>
          <div>
            <label style={S.fLabel}>Category <span style={{ color: T.re }}>*</span></label>
            <select id="cost-f-category" value={p.category || ''} onChange={e => onCategory(e.target.value)} aria-label="Category" required
              style={{ ...S.fInput, height: 44, cursor: 'pointer', color: p.category ? T.tx : T.tx3 }}>
              <option value="">Pick a category</option>
              {p.category && !categories.includes(p.category) && <option value={p.category}>{p.category}</option>}
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="button" onClick={onClose} style={{ ...S.btnPrimary, minHeight: 44, marginTop: 4 }}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
