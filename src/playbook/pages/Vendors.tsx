// Vendors: who supplies the products — add, edit, deactivate, and how many
// products each has in the directory. Spec: docs/playbook/product-directory-spec.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../../components/ui/Empty';
import type { AddToast } from '../components/PbToasts';
import PbModal from '../components/product/PbModal';
import { Field, input44 } from '../components/website/ui';
import { Dot } from '../components/product/status';
import { VENDOR_PAGE, listVendors, saveVendor, setVendorActive, type VendorRow } from '../data/vendors';

type Form = { id: string | null; name: string; code: string; notes: string };
const NEW: Form = { id: null, name: '', code: '', notes: '' };

export default function Vendors({ addToast }: { addToast: AddToast }) {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const seq = useRef(0);

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
      setRows(r.rows); setCount(r.count);
    }
    catch (e) { if (my === seq.current) addToast(friendlyError(e), 'error'); }
    finally { if (my === seq.current) setLoading(false); }
  }, [q, inactive, page, addToast]);
  useEffect(() => { void load(); }, [load]);

  const close = () => { setForm(null); setErr(''); setSaving(false); };
  const save = async () => {
    if (!form) return;
    const name = form.name.trim().replace(/\s+/g, ' ');
    if (!name) { setErr('Type the vendor name'); return; }
    setSaving(true); setErr('');
    try {
      await saveVendor(form.id, { name, code: form.code.trim() || null, notes: form.notes.trim() || null });
      addToast(form.id ? 'Vendor saved' : `${name} added`, 'success');
      close(); void load();
    } catch (e) { const m = friendlyError(e); setErr(m); addToast(m, 'error'); setSaving(false); }
  };

  const toggle = async (v: VendorRow) => {
    setBusy(v.id);
    try {
      await setVendorActive(v.id, !v.active);
      addToast(v.active ? `${v.name} deactivated — hidden from pickers, products stay` : `${v.name} is active again`, 'success');
      // A row leaving the list resets to the first page (as after a delete).
      if (v.active && !inactive && page !== 0) setPage(0); else void load();
    } catch (e) { addToast(friendlyError(e), 'error'); } finally { setBusy(''); }
  };

  const pages = Math.max(1, Math.ceil(count / VENDOR_PAGE));
  const pBtn = (off: boolean) => ({ ...S.btnGhost, minHeight: 44, minWidth: 64, opacity: off ? 0.3 : 1, pointerEvents: off ? 'none' as const : 'auto' as const });

  return (
    <>
      <div style={{ ...S.flexBetween, gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>Vendors</div>
          <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Who supplies the products — rules can send a vendor's products to chosen websites</div>
        </div>
        <button type="button" onClick={() => setForm(NEW)} style={{ ...S.btnPrimary, minHeight: 44 }}>+ Add vendor</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.tx3} strokeWidth="1.8" strokeLinecap="round" aria-hidden
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code" aria-label="Search vendors" style={{ ...S.fSearch, minHeight: 44 }} />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 12, color: T.tx2, cursor: 'pointer' }}>
          <input type="checkbox" checked={inactive} onChange={e => { setInactive(e.target.checked); setPage(0); }} style={{ width: 18, height: 18 }} />Show inactive
        </label>
      </div>

      {loading && !rows.length ? <div style={S.emptyState}>Loading vendors…</div> : rows.length === 0 ? (
        q ? <Empty icon="search" title="No vendor matches" message="Try another name or code." />
          : <Empty icon="handshake" title="No vendors yet" message="Add the people you buy from. Products and routing rules link to them." cta="Add vendor" onCta={() => setForm(NEW)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: loading ? 0.6 : 1 }}>
          {rows.map(v => (
            <div key={v.id} style={{ ...S.card, padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: v.active ? T.tx : T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name}{v.code && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.tx3, marginLeft: 8 }}>{v.code}</span>}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <Dot color={v.active ? T.gr : T.tx3} label={v.active ? 'Active' : 'Inactive'} />
                  <span style={{ fontSize: 11, color: T.tx2 }}>{v.products} product{v.products === 1 ? '' : 's'}</span>
                </div>
                {v.notes && <div style={{ fontSize: 11, color: T.tx3, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.notes}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setForm({ id: v.id, name: v.name, code: v.code ?? '', notes: v.notes ?? '' })} style={{ ...S.btnGhost, minHeight: 44 }}>Edit</button>
                <button type="button" onClick={() => void toggle(v)}
                  style={{ ...(v.active ? S.btnDanger : S.btnSuccess), minHeight: 44, pointerEvents: busy ? 'none' : 'auto', opacity: busy === v.id ? 0.5 : 1 }}>
                  {busy === v.id ? 'Saving…' : v.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(count > VENDOR_PAGE || page > 0) && (
        <div style={{ ...S.flexBetween, gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0} style={pBtn(page === 0)}>Prev</button>
            <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {pages}</span>
            <button type="button" onClick={() => setPage(p => p + 1)} disabled={page >= pages - 1} style={pBtn(page >= pages - 1)}>Next</button>
          </div>
          <span style={{ fontSize: 11, color: T.tx3 }}>{count} vendors</span>
        </div>
      )}

      <PbModal open={!!form} title={form?.id ? 'Edit vendor' : 'Add vendor'} onClose={close}>
        {form && (
          <form onSubmit={e => { e.preventDefault(); void save(); }}>
            <Field label="Name" htmlFor="pbv-name">
              <input id="pbv-name" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={120} style={input44} />
            </Field>
            <Field label="Short code" htmlFor="pbv-code" hint="Optional — usable in tags as {vendor_code}, e.g. RG">
              <input id="pbv-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} maxLength={20} style={{ ...input44, fontFamily: T.mono }} />
            </Field>
            <Field label="Notes" htmlFor="pbv-notes">
              <textarea id="pbv-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={3}
                style={{ ...S.fInput, height: 'auto', minHeight: 72, resize: 'vertical', lineHeight: 1.5 }} />
            </Field>
            {err && <div style={{ ...S.errorBox, marginBottom: 12 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={close} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
              <button type="submit" style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save vendor'}</button>
            </div>
          </form>
        )}
      </PbModal>
    </>
  );
}
