// Add / edit one contact. Roles are chips: a contact can be a customer, a
// supplier, or both — an existing role cannot be removed here (challans and
// POs reference the record), only added. Saving goes through save_contact
// (one transaction across both masters). Issued documents are never
// rewritten: they keep the name and phone they were printed with.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { numericKeyDown } from '../../lib/numericInput';
import { useModalLock } from '../../hooks/useModalLock';
import { useBackClose } from '../../hooks/useBackClose';
import Toggle from '../ui/Toggle';
import { formOf, validateForm, digits, type ContactRow, type ContactForm } from './contactsMerge';
import { saveContact } from './contactsModel';

const lbl: React.CSSProperties = { ...S.fLabel, marginBottom: 4 };
const roleChip = (on: boolean, locked: boolean): React.CSSProperties => ({
  ...S.btnGhost, minHeight: 36, padding: '6px 14px', fontSize: 12, fontWeight: 600,
  background: on ? T.ac3 : 'transparent', color: on ? T.ac2 : T.tx3, borderColor: on ? T.ac33 : T.bd2,
  cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.85 : 1,
});

export default function ContactModal({ contact, canEdit, onClose, onSaved, addToast }: {
  contact: ContactRow | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [f, setF] = useState<ContactForm>(() => formOf(contact));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useModalLock();
  useBackClose(true, onClose);
  useEffect(() => { if (error) errRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [error]);

  const set = (p: Partial<ContactForm>) => setF(prev => ({ ...prev, ...p }));
  const lockedCustomer = !!contact?.customerId;
  const lockedSupplier = !!contact?.vendorId;

  const save = async () => {
    if (saving || !canEdit) return;
    const problem = validateForm(f);
    if (problem) { setError(problem); return; }
    setError('');
    setSaving(true);
    try {
      await saveContact(contact, { ...f, name: f.name.trim(), phone: digits(f.phone) });
      addToast(contact ? `${f.name.trim()} updated` : `${f.name.trim()} added`, 'success');
      onSaved();
    } catch (e) { setError(friendlyError(e)); setSaving(false); return; }
    setSaving(false);
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  const ro = !canEdit;

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 460, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{contact ? (canEdit ? 'Edit contact' : 'Contact') : 'New contact'}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Name *</label>
            <input value={f.name} onChange={e => set({ name: e.target.value })} onKeyDown={onEnter} placeholder="Customer or supplier name" readOnly={ro} autoFocus={!contact} style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Phone {f.asSupplier ? '*' : ''}</label>
            <input value={f.phone} onChange={e => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 12) })} onKeyDown={e => { numericKeyDown(e); onEnter(e); }} inputMode="numeric" placeholder="10 digits" readOnly={ro} style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Used as</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" aria-pressed={f.asCustomer} disabled={ro || lockedCustomer} onClick={() => set({ asCustomer: !f.asCustomer })}
                title={lockedCustomer ? 'Already a customer — challans reference this record, so the role stays' : 'Show in Cash Challan'} style={roleChip(f.asCustomer, lockedCustomer)}>Customer</button>
              <button type="button" aria-pressed={f.asSupplier} disabled={ro || lockedSupplier} onClick={() => set({ asSupplier: !f.asSupplier })}
                title={lockedSupplier ? 'Already a supplier — POs reference this record, so the role stays' : 'Show in Purchase Orders'} style={roleChip(f.asSupplier, lockedSupplier)}>Supplier</button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Address</label>
            <textarea value={f.address} onChange={e => set({ address: e.target.value })} rows={2} readOnly={ro} placeholder="Optional" style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 56, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          {f.asSupplier && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>GSTIN</label>
                <input value={f.gstin} onChange={e => set({ gstin: e.target.value.toUpperCase() })} onKeyDown={onEnter} readOnly={ro} placeholder="Optional" style={{ ...S.fInput, width: '100%', fontFamily: T.mono }} />
              </div>
              <div>
                <label style={lbl}>Active supplier</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
                  <Toggle size="sm" on={f.active} label="Active supplier" onToggle={() => { if (!ro) set({ active: !f.active }); }} />
                  <span style={{ fontSize: 11, color: T.tx3 }}>{f.active ? 'shown in the PO picker' : 'hidden from the PO picker'}</span>
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Notes</label>
                <input value={f.notes} onChange={e => set({ notes: e.target.value })} onKeyDown={onEnter} readOnly={ro} placeholder="Terms, what they supply…" style={{ ...S.fInput, width: '100%' }} />
              </div>
            </div>
          )}
          <div style={{ fontSize: 10, color: T.tx3, lineHeight: 1.5 }}>Issued challans and purchase orders keep the name and phone they were printed with; edits apply to new ones.</div>
          {error && <div ref={errRef} style={{ marginTop: 12, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: `1px solid ${T.bd}` }}>
          <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 40 }}>{canEdit ? 'Cancel' : 'Close'}</button>
          {canEdit && <button type="button" onClick={save} style={{ ...S.btnPrimary, flex: 1, minHeight: 40, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save contact'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
