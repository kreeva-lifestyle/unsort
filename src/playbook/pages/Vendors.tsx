// Vendors: who supplies the products — add, edit, deactivate, and how many
// products each has in the directory. Spec: docs/playbook/product-directory-spec.md.
// V2 layout: desktop = (12 toolbar tile) / (12 tile of glass rows) / pager;
// phone = search + "Show inactive" chip, then the rows straight on the backdrop.
// Deactivate / Activate sits at the end of the Edit sheet (VendorForm), not on the rows.
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import type { AddToast } from '../components/PbToasts';
import Pager from '../components/product/Pager';
import { PB, pbInput } from '../pbTheme';
import { useIsPhone } from '../hooks/useIsPhone';
import { PbButton, PbChip, PbChipRow, PbIcon, PbPageHeader, PbTile } from '../components/ui';
import VendorRow from '../components/vendors/VendorRow';
import VendorForm, { type VendorFormState as Form } from '../components/vendors/VendorForm';
import { VendorsAllInactive, VendorsEmpty, VendorsError, VendorsNoMatch, VendorsSkeleton } from '../components/vendors/VendorStates';
import { VENDOR_PAGE, countInactiveVendors, listVendors, normalizeTgChannel, parseShortNames, saveVendor, setVendorActive, type VendorRow as Vendor } from '../data/vendors';

const NEW: Form = { id: null, name: '', code: '', notes: '', tg: '' };

export default function Vendors({ addToast, onBack }: { addToast: AddToast; onBack?: () => void }) {
  const [rows, setRows] = useState<Vendor[]>([]);
  const [count, setCount] = useState(0);
  const [hidden, setHidden] = useState(0); // inactive vendors behind an empty "active only" list
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const seq = useRef(0);
  const phone = useIsPhone();

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await listVendors(q, inactive, page);
      if (my !== seq.current) return;
      // Past the last page (last row deactivated, or the list shrank) → step back to the real last page.
      const last = Math.max(0, Math.ceil(r.count / VENDOR_PAGE) - 1);
      if (page > last) { setPage(last); return; }
      // Nothing active and no search: are there vendors that were switched off? (else this looks like a first run)
      const off = r.count === 0 && !q && !inactive ? await countInactiveVendors() : 0;
      if (my !== seq.current) return;
      setRows(r.rows); setCount(r.count); setHidden(off); setLoadErr('');
    }
    // The error shows in the list tile with Try again (no toast on top of the header).
    catch (e) { if (my === seq.current) setLoadErr(friendlyError(e)); }
    finally { if (my === seq.current) setLoading(false); }
  }, [q, inactive, page]);
  useEffect(() => { void load(); }, [load]);

  const close = () => { setForm(null); setErr(''); setSaving(false); };
  const save = async () => {
    if (!form) return;
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Type the vendor name'); return; }
    const codes = parseShortNames(form.code);
    if ('error' in codes) { setErr(codes.error); return; }
    const tg = normalizeTgChannel(form.tg);
    if ('error' in tg) { setErr(tg.error); return; }
    setSaving(true); setErr('');
    try {
      await saveVendor(form.id, { name, codes: codes.value, notes: form.notes.trim() || null, tg_username: tg.value });
      addToast(form.id ? 'Vendor saved' : `${name} added`, 'success');
      close(); void load();
    } catch (e) { const m = friendlyError(e); setErr(m); addToast(m, 'error'); setSaving(false); }
  };

  const toggle = async (v: Vendor) => {
    setBusy(v.id);
    try {
      await setVendorActive(v.id, !v.active);
      addToast(v.active ? `${v.name} deactivated — hidden from pickers, products stay` : `${v.name} is active again`, 'success');
      // A row leaving the list resets to the first page (as after a delete).
      if (v.active && !inactive && page !== 0) setPage(0); else void load();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const add = () => setForm(NEW);
  const editing = form?.id ? rows.find(r => r.id === form.id) : undefined;
  const firstLoad = loading && !rows.length && !loadErr;

  const toolbar = (
    <div style={{ display: 'flex', flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', gap: phone ? 8 : 12, minWidth: 0 }}>
      <div style={{ position: 'relative', flex: phone ? 'none' : '1 1 320px', minWidth: 0 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: PB.tx3, display: 'inline-flex', pointerEvents: 'none' }}>
          <PbIcon name="search" size={16} />
        </span>
        <input type="search" className="pb-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, short name, channel"
          aria-label="Search vendors" enterKeyHint="search" autoCorrect="off" spellCheck={false}
          style={{ ...pbInput, paddingLeft: 40, paddingRight: search ? 48 : 14 }} />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="pb-pill"
            style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, border: 'none', background: 'transparent', color: PB.tx2, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: PB.r.input }}>
            <PbIcon name="x" size={16} />
          </button>
        )}
      </div>
      <PbChipRow label="Filter vendors">
        <PbChip pressed={inactive} onClick={() => { setInactive(!inactive); setPage(0); }}>Show inactive</PbChip>
      </PbChipRow>
    </div>
  );

  const list = (
    <ul aria-label="Vendors" aria-busy={loading || undefined}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, opacity: loading ? 0.6 : 1, transition: 'opacity .3s ease' }}>
      {rows.map(v => (
        <VendorRow key={v.id} v={v} busy={busy} compact={phone}
          onEdit={() => setForm({ id: v.id, name: v.name, code: v.code ?? '', notes: v.notes ?? '', tg: v.tg_username ? `@${v.tg_username}` : '' })} />
      ))}
    </ul>
  );

  // Tile padding stays 20 (as the toolbar tile above), so the rows' left edge lines up with the search field.
  const inTile = (n: ReactElement) => (phone ? n : <PbTile as="section" aria-label="Vendor list">{n}</PbTile>);
  const body = firstLoad ? inTile(<VendorsSkeleton />)
    : loadErr && !rows.length ? <VendorsError message={loadErr} onRetry={() => void load()} busy={loading} />
      : rows.length === 0 ? (q ? <VendorsNoMatch search={q} onClear={() => setSearch('')} />
        : hidden > 0 ? <VendorsAllInactive n={hidden} onShow={() => { setInactive(true); setPage(0); }} /> : <VendorsEmpty onAdd={add} />)
        : inTile(list);

  return (
    <>
      <PbPageHeader title="Vendors" sub="Who supplies the products — rules can send a vendor's products to chosen websites"
        back={onBack ? { label: 'More', onBack } : undefined}
        actions={<PbButton kind="primary" icon="plus" onClick={add}>Add vendor</PbButton>}
        phoneAction={<PbButton kind="primary" iconOnly icon="plus" aria-label="Add vendor" onClick={add} />} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: phone ? 12 : 16, minWidth: 0 }}>
        {/* First run (no vendors at all): no search or filter over an empty page. */}
        {(count > 0 || hidden > 0 || firstLoad || search || q || inactive) && (phone ? toolbar : <PbTile as="section" aria-label="Search vendors">{toolbar}</PbTile>)}
        {loadErr && rows.length > 0 && <VendorsError inline message={loadErr} onRetry={() => void load()} busy={loading} />}
        {body}
      </div>
      {(count > VENDOR_PAGE || page > 0) && <Pager page={page} pageSize={VENDOR_PAGE} count={count} onPage={setPage} noun="vendor" />}
      <VendorForm form={form} setForm={setForm} saving={saving} err={err} onSave={() => void save()} onClose={close} saved={editing}
        toggle={editing ? { active: editing.active, name: editing.name, busy: busy === editing.id, dim: !!busy && busy !== editing.id, onToggle: () => void toggle(editing) } : undefined} />
    </>
  );
}
