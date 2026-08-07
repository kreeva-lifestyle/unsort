// "Fetch from Master" — load a whole slice of the offline master sheet into
// the Listing AI SKU box instead of pasting. Pick a category, pick a brand
// (ARYA / DRESSTIVE), and the edge fn's `master_picker` action returns that
// slice's ACTIVE SKUs from the DB mirror. ACTIVE-only on purpose: generating
// listings for designs that cannot ship is pure AI spend.
// Exports ONE component that owns both the button and the modal, so
// ListingAI.tsx (at its file-size budget) grows by a single element.
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { call } from './api';
import { useBackClose } from '../../hooks/useBackClose';

interface PickerCategory { id: string; label: string; counts: Record<string, number> }

export default function MasterFetch({ busy, hasSkus, onPick, addToast }: {
  busy: boolean;                 // a run owns the SKU box — never replace it mid-run
  hasSkus: boolean;              // box already has content → say we replace it
  onPick: (skus: string[], label: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<{ categories: PickerCategory[]; brands: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(false);

  useBackClose(open, () => setOpen(false));
  useEffect(() => { document.body.classList.toggle('modal-open', open); return () => document.body.classList.remove('modal-open'); }, [open]);
  // Full state reset on close (modal contract) + counts fetched fresh per
  // open, so a master-sync that ran in between is reflected.
  useEffect(() => {
    if (!open) { setMeta(null); setErr(''); setCategory(''); setBrand(''); setLoading(false); return; }
    // Stale guard: closing while the counts fetch is in flight must not let
    // the late response repopulate the just-reset state (or toast warnings
    // for a modal that is no longer on screen).
    let stale = false;
    (async () => {
      try {
        const { status, data } = await call({ action: 'master_picker' });
        if (stale) return;
        if (!data?.ok) throw new Error(String(data?.details || data?.error || `Failed (${status})`));
        setMeta({ categories: data.categories || [], brands: data.brands || [] });
        for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      } catch (e) { if (!stale) setErr(friendlyError(e)); }
    })();
    return () => { stale = true; };
  }, [open, addToast]);

  const cat = meta?.categories.find(c => c.id === category);
  const count = cat && brand ? (cat.counts[brand] || 0) : 0;

  const load = async () => {
    if (loading || !category || !brand) return;
    setErr(''); setLoading(true);
    try {
      const { status, data } = await call({ action: 'master_picker', brand, category });
      if (!data?.ok) throw new Error(String(data?.details || data?.error || `Failed (${status})`));
      const skus = (data.skus || []) as string[];
      for (const w of (data.warnings || []) as string[]) addToast(w, 'error');
      onPick(skus, `${data.categoryLabel} · ${brand}`);
      addToast(`Loaded ${skus.length} ACTIVE ${data.categoryLabel} SKU${skus.length > 1 ? 's' : ''} from ${brand}`, 'success');
      setOpen(false);
    } catch (e) { setErr(friendlyError(e)); }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} disabled={busy} title={busy ? 'Wait for the current generation to finish' : 'Load ACTIVE SKUs of a category from the master sheet'}
        style={{ ...S.btnGhost, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>Fetch from Master</button>

      {open && createPortal((
        <div style={{ ...S.modalOverlay }} onClick={() => setOpen(false)}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 420 }} onClick={ev => ev.stopPropagation()}>
            <div style={S.modalHead}>
              <div style={S.modalTitle}>Fetch from Master</div>
              <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
            </div>
            <div style={{ padding: 16 }}>
              {!meta && !err && <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
              {meta && (
                <>
                  <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>Only designs marked ACTIVE in the master sheet are loaded — inactive ones can&rsquo;t ship, so they&rsquo;re never worth AI spend.</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Category</label>
                    <select value={category} onChange={e => { setCategory(e.target.value); setBrand(''); }} autoFocus style={{ ...S.fInput, width: '100%' }}>
                      <option value="">Choose…</option>
                      {meta.categories.map(c => (
                        <option key={c.id} value={c.id}>{c.label} — {meta.brands.map(b => `${b} ${c.counts[b] || 0}`).join(' · ')}</option>
                      ))}
                    </select>
                  </div>
                  {cat && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ ...S.fLabel, display: 'block', marginBottom: 4 }}>Brand</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {meta.brands.map(b => {
                          const n = cat.counts[b] || 0;
                          const on = brand === b;
                          return (
                            <button key={b} onClick={() => n > 0 && setBrand(b)} disabled={n === 0} title={n === 0 ? `No ACTIVE ${cat.label} designs on ${b}` : undefined}
                              style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', minHeight: 44, opacity: n === 0 ? 0.35 : 1, borderColor: on ? 'oklch(0.55 0.22 265 / .5)' : undefined, background: on ? T.ac3 : undefined, color: on ? T.ac2 : undefined, fontWeight: on ? 700 : 500 }}>
                              {b} ({n})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {hasSkus && count > 0 && <div style={{ fontSize: 10, color: T.yl, marginBottom: 10 }}>The SKU box already has content — loading will replace it.</div>}
                </>
              )}
              {err && <div style={{ background: 'oklch(0.63 0.22 25 / .08)', border: '1px solid oklch(0.63 0.22 25 / .2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOpen(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={load} disabled={loading || !count} style={{ ...S.btnPrimary, flex: 1, pointerEvents: loading || !count ? 'none' : 'auto', opacity: loading || !count ? 0.5 : 1 }}>
                  {loading ? 'Loading…' : count ? `Load ${count} SKU${count > 1 ? 's' : ''}` : 'Load'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </>
  );
}
