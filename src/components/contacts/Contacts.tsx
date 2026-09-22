// Contacts — ONE list for Cash Challan and Purchase Orders (owner's call):
// every customer and supplier together, role chips telling them apart, a
// search over name / phone / address and a filter for the module's side.
// Mounted as a sub-view by both pages; the parent owns the Back entry.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useCrumb } from '../../hooks/useBreadcrumb';
import { loadContacts } from './contactsModel';
import { filterContacts, type ContactRow, type Role } from './contactsMerge';
import ContactList from './ContactList';
import ContactModal from './ContactModal';

const ROLES: { id: Role; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'customer', label: 'Customers' }, { id: 'supplier', label: 'Suppliers' }];
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function Contacts({ canEdit, onBack, addToast }: {
  canEdit: boolean;
  onBack: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role>('all');
  const [editing, setEditing] = useState<ContactRow | null | 'new'>(null);
  // House pagination: back to the first page on any search, filter or save.
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  useCrumb('Contacts');

  const load = useCallback(() => {
    loadContacts().then(r => { setRows(r); setPage(0); }).catch(e => { addToast(friendlyError(e), 'error'); setRows([]); });
  }, [addToast]);
  useEffect(load, [load]);
  useEffect(() => { setPage(0); }, [q, role, perPage]);

  const shown = rows ? filterContacts(rows, q, role) : [];
  const pageCount = Math.max(1, Math.ceil(shown.length / perPage));
  const cur = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(cur * perPage, (cur + 1) * perPage);
  const counts = rows ? { customer: rows.filter(r => r.customerId).length, supplier: rows.filter(r => r.vendorId).length } : null;

  return (
    <div className="page-pad" style={{ fontFamily: T.sans, color: T.tx, padding: '10px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={S.btnGhost}>← Back</button>
        <div style={{ fontSize: 12, color: T.tx3, flex: 1, minWidth: 120 }}>
          {rows === null ? 'Loading contacts…' : `${rows.length} contact${rows.length === 1 ? '' : 's'} · ${counts!.customer} customer${counts!.customer === 1 ? '' : 's'} · ${counts!.supplier} supplier${counts!.supplier === 1 ? '' : 's'}`}
        </div>
        {canEdit && <button className="desktop-only" onClick={() => setEditing('new')} style={S.btnPrimary}>+ New contact</button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5, pointerEvents: 'none' }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone or address…" aria-label="Search contacts" style={{ ...S.fSearch, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ROLES.map(r => (
            <button key={r.id} type="button" onClick={() => setRole(r.id)} aria-pressed={role === r.id}
              style={{ ...S.btnGhost, ...S.btnSm, minHeight: 36, padding: '6px 12px', fontSize: 11, background: role === r.id ? T.ac3 : 'transparent', color: role === r.id ? T.ac2 : T.tx3, borderColor: role === r.id ? T.ac33 : T.bd2 }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {rows === null
        ? <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>
        : <ContactList rows={pageRows} total={rows.length} q={q} canEdit={canEdit} onOpen={c => setEditing(c)} onNew={() => setEditing('new')} />}

      {shown.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={cur === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur === 0 ? 0.3 : 1 }}>Prev</button>
            <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{cur + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={cur >= pageCount - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur >= pageCount - 1 ? 0.3 : 1 }}>Next</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: T.tx3 }}>
            <span>{shown.length} contact{shown.length === 1 ? '' : 's'}</span>
            <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} aria-label="Contacts per page" style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto' }}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
        </div>
      )}

      {editing !== null && (
        <ContactModal contact={editing === 'new' ? null : editing} canEdit={canEdit} addToast={addToast}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {/* Mobile: the FAB replaces the header button (house rule); the parent
          page hides its own FAB while this view is open. */}
      {canEdit && editing === null && createPortal(
        <button className="fab" aria-label="New contact" onClick={() => setEditing('new')}>+</button>,
        document.body,
      )}
    </div>
  );
}
