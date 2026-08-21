// Product Costing — list of costing sheets (photo, SKU, total cost) with a
// full-sheet editor behind each one. Cost of a garment = Σ over main
// components of Σ over sub-components (qty × selected supplier's rate),
// plus the maintenance %.
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { CostingProduct, blankComponent, totalCost, money, buildLibrary } from './costingModel';
import CostingEditor from './CostingEditor';

export default function ProductCosting({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const [list, setList] = useState<CostingProduct[] | null>(null);
  const [editing, setEditing] = useState<CostingProduct | null>(null);
  const [search, setSearch] = useState('');
  // Whether the open costing already exists in the DB - a new or duplicated
  // one has nothing to delete, so the editor hides its Delete button.
  const [editingSaved, setEditingSaved] = useState(false);

  const load = () => {
    supabase.from('costing_products')
      .select('id, sku, image_url, maintenance_pct, components, notes, updated_at')
      .order('updated_at', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (error) { addToast(friendlyError(error), 'error'); setList([]); return; }
        setList((data ?? []) as CostingProduct[]);
      });
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const newSheet = () => {
    setEditingSaved(false);
    setEditing({
      id: crypto.randomUUID(), sku: '', image_url: null,
      maintenance_pct: 0, components: [blankComponent()], notes: '',
    });
  };

  if (editing) {
    // Everything typed on ANY sheet, offered back as dropdown suggestions —
    // one spelling per supplier keeps the purchase plan grouped correctly.
    const library = buildLibrary(list ?? []);
    return (
      <CostingEditor product={editing} saved={editingSaved} library={library} addToast={addToast}
        onBack={() => { setEditing(null); load(); }}
        onSaved={() => { setEditing(null); load(); }} />
    );
  }

  const q = search.trim().toUpperCase();
  const shown = (list ?? []).filter(p => !q || p.sku.toUpperCase().includes(q));

  return (
    <div style={{ fontFamily: T.sans, color: T.tx }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU…"
          style={{ ...S.fInput, flex: 1, minWidth: 160 }} />
        <button onClick={newSheet} style={{ ...S.btnPrimary, minHeight: 36 }}>+ New product costing</button>
      </div>

      {list === null && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>}
      {list !== null && shown.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center', color: T.tx3, fontSize: 12, lineHeight: 1.7 }}>
          {q ? 'No product costing matches that SKU.' : 'Nothing costed yet — tap "+ New product costing" to cost your first product: photo, components, suppliers with material codes, and a purchase plan for any quantity.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {shown.map(p => (
          <div key={p.id} onClick={() => { setEditingSaved(true); setEditing(p); }}
            style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: T.s2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.image_url
                ? <img src={p.image_url} alt={p.sku} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 9, color: T.tx3 }}>no photo</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.tx }}>{p.sku}</div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                {p.components.length} component{p.components.length === 1 ? '' : 's'} · <span style={{ color: T.ac2, fontFamily: T.mono }}>{money(totalCost(p.components, p.maintenance_pct))}</span>/pc
              </div>
            </div>
            {/* Duplicate: same components/photo, BLANK SKU - the unique
                index refuses a same-SKU save, so a fresh code is forced. */}
            <span onClick={e => { e.stopPropagation(); setEditingSaved(false); setEditing({ ...p, id: crypto.randomUUID(), sku: '' }); }}
              title="Duplicate this product costing" aria-label={`Duplicate ${p.sku}`}
              style={{ cursor: 'pointer', color: T.ac2, fontSize: 13, padding: 6 }}>⧉</span>
          </div>
        ))}
      </div>
    </div>
  );
}
