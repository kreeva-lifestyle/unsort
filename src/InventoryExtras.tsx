import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './lib/supabase';

import { T } from './lib/theme';
import type {
  Product,
  ProductComponent,
  InventoryItem,
  ItemComponent,
  InventoryExtra,
  InventoryExtraHistory,
} from './types/database';

const SIZES = ['N/A', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size', 'Semi-Stitched'];
const isDupatta = (name: string) => /dup+at*a|orhni|chunni|stole/i.test(name);
const isLehenga = (name: string) => /lehenga|lehnga|ghaghra/i.test(name);
const isBottomType = (name: string) => /bottom|pant|trouser|skirt|salwar|churidar|palazzo/i.test(name);

// View model: narrowed inventory_items row for the matching UI.
type InventoryItemMatch = Pick<InventoryItem, 'id' | 'batch_number' | 'serial_number' | 'size' | 'location' | 'status'>;

export default function InventoryExtras() {
  const [extras, setExtras] = useState<InventoryExtra[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Add form
  const [fProductId, setFProductId] = useState('');
  const [fComponentId, setFComponentId] = useState('');
  const [fSku, setFSku] = useState('');
  const [fSkuSuggestions, setFSkuSuggestions] = useState<string[]>([]);
  const [showSkuDrop, setShowSkuDrop] = useState(false);
  const [fSize, setFSize] = useState('');
  const [fQty, setFQty] = useState('1');
  const [fNotes, setFNotes] = useState('');
  const [fComps, setFComps] = useState<ProductComponent[]>([]);
  // Adjust qty
  const [adjustExtra, setAdjustExtra] = useState<InventoryExtra | null>(null);
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  // History
  const [historyExtra, setHistoryExtra] = useState<InventoryExtra | null>(null);
  const [history, setHistory] = useState<InventoryExtraHistory[]>([]);
  // Matches
  const [matchExtra, setMatchExtra] = useState<InventoryExtra | null>(null);
  const [matches, setMatches] = useState<InventoryItemMatch[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  // Complete confirm
  const [completeItem, setCompleteItem] = useState<{ extra: InventoryExtra; item: InventoryItemMatch } | null>(null);

  const fetchExtras = useCallback(async () => {
    const { data } = await supabase.from('inventory_extras').select('*').order('updated_at', { ascending: false }).limit(1000);
    setExtras(data || []);
    // Compute match counts — check item actually has this component missing
    const counts: Record<string, number> = {};
    const { data: unsorted } = await supabase.from('inventory_items').select('id, serial_number, size, product_id').eq('status', 'unsorted');
    const { data: allComps } = await supabase.from('item_components').select('inventory_item_id, component_id, status');
    const missingMap: Record<string, Set<string>> = {};
    type ItemCompsRow = Pick<ItemComponent, 'inventory_item_id' | 'component_id' | 'status'>;
    (allComps as ItemCompsRow[] | null || []).forEach((ic) => { if (ic.status === 'missing' || ic.status === 'damaged') { if (!missingMap[ic.inventory_item_id]) missingMap[ic.inventory_item_id] = new Set(); missingMap[ic.inventory_item_id].add(ic.component_id); } });
    for (const ex of (data || [])) {
      counts[ex.id] = (unsorted || []).filter(it =>
        it.serial_number === ex.sku && it.product_id === ex.product_id &&
        (ex.size === 'N/A' || !ex.size || (it.size || 'N/A') === ex.size) &&
        missingMap[it.id]?.has(ex.component_id)
      ).length;
    }
    setMatchCounts(counts);
  }, []);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    setProducts(data || []);
  }, []);

  useEffect(() => { fetchExtras(); fetchProducts(); }, [fetchExtras, fetchProducts]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('extras-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_extras' }, () => fetchExtras())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_extras_history' }, () => {
        if (historyExtra) loadHistory(historyExtra.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchExtras, historyExtra]);

  // SKU autocomplete
  const searchSkus = useCallback(async (q: string) => {
    if (q.length < 2) { setFSkuSuggestions([]); return; }
    const { data } = await supabase.from('inventory_items').select('serial_number').ilike('serial_number', `%${q.replace(/[%_]/g, '\\$&')}%`).limit(10);
    const unique = [...new Set((data || []).map((r) => r.serial_number).filter((s): s is string => !!s))];
    setFSkuSuggestions(unique);
    setShowSkuDrop(unique.length > 0);
  }, []);

  // Load components when product selected in Add form
  useEffect(() => {
    if (!fProductId) { setFComps([]); return; }
    supabase.from('components').select('*').eq('product_id', fProductId).order('name').then(({ data }) => setFComps(data || []));
  }, [fProductId]);

  // Auto-set size for dupatta components
  useEffect(() => {
    if (!fComponentId) return;
    const comp = fComps.find(c => c.id === fComponentId);
    if (comp && isDupatta(comp.name)) setFSize('N/A');
    else if (fSize === 'N/A') setFSize('');
  }, [fComponentId, fComps, fSize]);

  const loadHistory = async (extraId: string) => {
    const { data } = await supabase.from('inventory_extras_history').select('*').eq('extra_id', extraId).order('created_at', { ascending: false });
    setHistory(data || []);
  };

  const loadMatches = async (ex: InventoryExtra) => {
    let q = supabase.from('inventory_items').select('id, batch_number, serial_number, size, location, status')
      .eq('status', 'unsorted').eq('serial_number', ex.sku).eq('product_id', ex.product_id);
    if (ex.size && ex.size !== 'N/A') q = q.eq('size', ex.size);
    const { data: candidates } = await q;
    // Filter to only items missing this specific component
    const { data: comps } = await supabase.from('item_components').select('inventory_item_id, component_id, status').in('inventory_item_id', (candidates || []).map(c => c.id));
    type ItemCompsRow = Pick<ItemComponent, 'inventory_item_id' | 'component_id' | 'status'>;
    const hasMissing = new Set((comps as ItemCompsRow[] | null || []).filter((c) => (c.status === 'missing' || c.status === 'damaged') && c.component_id === ex.component_id).map((c) => c.inventory_item_id));
    setMatches(((candidates as InventoryItemMatch[] | null) || []).filter(c => hasMissing.has(c.id)));
    setMatchExtra(ex);
  };

  const addExtra = async () => {
    setError('');
    if (!fProductId || !fComponentId || !fSku.trim() || !fSize) { setError('All fields required'); return; }
    const comp = fComps.find(c => c.id === fComponentId);
    const compIsDupatta = comp && isDupatta(comp.name);
    const compIsLehenga = comp && isLehenga(comp.name);
    const compIsBottom = comp && isBottomType(comp.name);
    if (compIsDupatta && fSize !== 'N/A') { setError('Dupatta must have size "N/A"'); return; }
    if (!compIsDupatta && fSize === 'N/A') { setError('N/A is only allowed for Dupatta/Orhni/Chunni/Stole'); return; }
    if (fSize === 'Free Size' && !compIsLehenga) { setError('Free Size is only allowed for Lehenga'); return; }
    if (compIsBottom && (fSize === 'N/A' || fSize === 'Free Size')) { setError('Bottom/Pant requires a specific size (not N/A or Free Size)'); return; }
    const qty = parseInt(fQty) || 0;
    if (qty < 1) { setError('Initial quantity must be at least 1 (cannot be zero)'); return; }
    setSaving(true);
    const prod = products.find(p => p.id === fProductId);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: err } = await supabase.from('inventory_extras').insert({
      product_id: fProductId, product_name: prod?.name || '', component_id: fComponentId,
      component_name: comp?.name || '', sku: fSku.trim(), size: fSize, quantity: qty,
      notes: fNotes.trim() || null, created_by: user?.id,
    }).select().single();
    if (err) {
      if (err.code === '23505') setError('This exact extra (category+component+SKU+size) already exists');
      else setError(err.message);
      setSaving(false); return;
    }
    // History entry
    const { error: histErr } = await supabase.from('inventory_extras_history').insert({
      extra_id: data.id, action: 'created', quantity_change: qty, quantity_after: qty, user_id: user?.id,
    });
    if (histErr) setError('Extra created but history log failed: ' + histErr.message);
    setSaving(false); setShowAdd(false);
    setFProductId(''); setFComponentId(''); setFSku(''); setFSize(''); setFQty('1'); setFNotes('');
    fetchExtras();
  };

  const adjustQuantity = async () => {
    if (!adjustExtra) return;
    const qty = parseInt(adjustQty) || 0;
    if (qty < 1) return;
    const newQty = adjustMode === 'add' ? adjustExtra.quantity + qty : adjustExtra.quantity - qty;
    if (newQty < 0) { setError('Cannot go below 0'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    // Optimistic concurrency check: fail if another user changed the quantity
    const { data: updated, error: upErr } = await supabase.from('inventory_extras')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', adjustExtra.id)
      .eq('quantity', adjustExtra.quantity)
      .select().single();
    if (upErr || !updated) { setError('Another user just updated this extra. Close and reopen to retry.'); return; }
    const { error: histErr } = await supabase.from('inventory_extras_history').insert({
      extra_id: adjustExtra.id, action: adjustMode === 'add' ? 'added' : 'removed',
      quantity_change: adjustMode === 'add' ? qty : -qty, quantity_after: newQty,
      reason: adjustReason.trim() || null, user_id: user?.id,
    });
    if (histErr) setError('Quantity updated but history log failed: ' + histErr.message);
    setAdjustExtra(null); setAdjustQty('1'); setAdjustReason(''); fetchExtras();
  };

  const completeWithExtra = async () => {
    if (!completeItem) return;
    const { extra, item } = completeItem;
    if (extra.quantity < 1) { setError('No quantity available'); return; }
    setSaving(true);
    // Atomic RPC: decrements extra, verifies item, marks complete, fills
    // component, and writes history + activity log — all in one transaction.
    const { error } = await supabase.rpc('complete_item_with_extra', {
      p_extra_id: extra.id,
      p_item_id: item.id,
      p_reason: null,
    });
    if (error) { setError(error.message); setSaving(false); return; }
    setSaving(false); setCompleteItem(null); setMatchExtra(null); fetchExtras();
  };

  // Filtered list
  const filtered = extras.filter(ex => {
    if (catFilter !== 'all' && ex.product_id !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ex.sku.toLowerCase().includes(q) || ex.product_name.toLowerCase().includes(q) || ex.component_name.toLowerCase().includes(q);
    }
    return true;
  });

  // Shared styles
  const label: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' };
  const input: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: T.sans };
  const btn: React.CSSProperties = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', fontFamily: T.sans };
  const btnGhost: React.CSSProperties = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', cursor: 'pointer', fontSize: 11, fontWeight: 500, background: 'rgba(99,102,241,0.06)', color: T.ac2, fontFamily: T.sans };
  const overlay: React.CSSProperties = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.80)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 8 };
  const modal: React.CSSProperties = { background: 'rgba(14,18,30,0.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.65)' };
  const th: React.CSSProperties = { fontSize: 9, color: T.tx3, padding: '8px 10px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.bd}`, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 11, borderBottom: `1px solid ${T.bd}`, color: T.tx2 };

  return (
    <div style={{ animation: 'fi .3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Extras</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => {
            if (filtered.length === 0) return;
            const csv = 'SKU,Category,Component,Size,Qty\n' + filtered.map(ex => `${ex.sku},"${ex.product_name}",${ex.component_name},${ex.size},${ex.quantity}`).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Extras_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
          }} style={btnGhost}>Export CSV</div>
          <div onClick={() => setShowAdd(true)} style={btn}>+ Add Extra</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="Search SKU, category, component..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...input, maxWidth: 260 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ ...input, maxWidth: 180 }}>
          <option value="all">All Categories</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>SKU</th><th style={th}>Category</th><th style={th}>Component</th>
            <th style={th}>Size</th><th style={th}>Qty</th><th style={th}>Matches</th><th style={th}>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 30, color: T.tx3 }}>No extras found</td></tr>}
            {filtered.map(ex => (
              <tr key={ex.id} style={{ transition: 'background 150ms' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ ...td, fontFamily: T.mono, fontSize: 11, color: T.tx }}>{ex.sku}</td>
                <td style={td}>{ex.product_name}{(() => { const p = products.find(pr => pr.id === ex.product_id); return p?.sku ? <span style={{ marginLeft: 4, fontSize: 9, color: T.tx3, fontFamily: T.mono }}>({p.sku})</span> : null; })()}</td>
                <td style={td}>{ex.component_name}</td>
                <td style={td}>{ex.size}</td>
                <td style={{ ...td, fontWeight: 600, color: ex.quantity > 0 ? T.gr : T.re }}>{ex.quantity}</td>
                <td style={td}>
                  {(matchCounts[ex.id] || 0) > 0 ? (
                    <span onClick={() => loadMatches(ex)} style={{ color: T.yl, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {matchCounts[ex.id]} match{matchCounts[ex.id] > 1 ? 'es' : ''}
                    </span>
                  ) : <span style={{ color: T.tx3, fontSize: 10 }}>--</span>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <span onClick={() => { setAdjustExtra(ex); setAdjustMode('add'); }} style={{ ...btnGhost, padding: '5px 10px', fontSize: 10, cursor: 'pointer', color: T.gr, borderColor: 'rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Add</span>{' '}
                  <span onClick={() => { setAdjustExtra(ex); setAdjustMode('remove'); }} style={{ ...btnGhost, padding: '5px 10px', fontSize: 10, cursor: 'pointer', color: T.re, borderColor: 'rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)' }}>Remove</span>{' '}
                  <span onClick={() => { setHistoryExtra(ex); loadHistory(ex.id); }} style={{ ...btnGhost, padding: '5px 10px', fontSize: 10, cursor: 'pointer' }}>History</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Extra Modal */}
      {showAdd && createPortal(<div style={overlay} onClick={() => { setShowAdd(false); setError(''); }}>
        <div className="modal-inner" style={modal} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Add Extra</span>
          </div>
          <form onSubmit={e => { e.preventDefault(); addExtra(); }} style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Category * <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 8, color: '#4A5568' }}>Select product category</span></label>
              <select value={fProductId} onChange={e => { setFProductId(e.target.value); setFComponentId(''); }} style={input}>
                <option value="">Select category...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Component *</label>
              <select value={fComponentId} onChange={e => setFComponentId(e.target.value)} style={input} disabled={!fProductId}>
                <option value="">Select component...</option>
                {fComps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <label style={label}>SKU *</label>
                <input value={fSku} onChange={e => { setFSku(e.target.value); searchSkus(e.target.value); }} onFocus={() => { if (fSkuSuggestions.length > 0) setShowSkuDrop(true); }} onBlur={() => setTimeout(() => setShowSkuDrop(false), 150)} placeholder="e.g. SW-1234" style={{ ...input, fontFamily: T.mono }} autoComplete="off" />
                {showSkuDrop && fSkuSuggestions.length > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 140, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,.3)' }}>
                  {fSkuSuggestions.map(s => <div key={s} onMouseDown={() => { setFSku(s); setShowSkuDrop(false); }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: T.mono, color: T.ac2, borderBottom: `1px solid ${T.bd}` }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{s}</div>)}
                </div>}
              </div>
              <div>
                <label style={label}>Size {(() => { const c = fComps.find(x => x.id === fComponentId); return c && isDupatta(c.name) ? '(N/A for Dupatta)' : '*'; })()}</label>
                <select value={fSize} onChange={e => setFSize(e.target.value)} style={input} disabled={!!fComponentId && isDupatta(fComps.find(c => c.id === fComponentId)?.name || '')}>
                  <option value="">Select size...</option>
                  {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={label}>Initial Quantity</label>
                <input type="number" min="1" value={fQty} onChange={e => setFQty(e.target.value)} style={input} />
              </div>
              <div>
                <label style={label}>Notes</label>
                <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Optional" style={input} />
              </div>
            </div>
            {error && <div style={{ color: T.re, fontSize: 11, marginBottom: 8 }}>{error}</div>}
            <div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <span onClick={() => { setShowAdd(false); setError(''); }} style={btnGhost}>Cancel</span>
              <button type="submit" style={{ ...btn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Add'}</button>
            </div>
          </form>
        </div>
      </div>, document.body)}

      {/* Adjust Quantity Modal */}
      {adjustExtra && createPortal(<div style={overlay} onClick={() => setAdjustExtra(null)}>
        <div className="modal-inner" style={{ ...modal, width: 380 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{adjustMode === 'add' ? 'Add' : 'Remove'} Quantity</span>
            <span onClick={() => setAdjustExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16 }}>&times;</span>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: T.tx2 }}>
              {adjustExtra.component_name} ({adjustExtra.sku}, {adjustExtra.size})
              <br/>Current: <span style={{ color: T.gr, fontWeight: 600 }}>{adjustExtra.quantity}</span>
            </div>
            <div><label style={label}>How many to {adjustMode}?</label>
              <input type="number" min="1" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} style={input} /></div>
            <div><label style={label}>Reason (optional)</label>
              <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Found more stock" style={input} /></div>
            {error && <div style={{ color: T.re, fontSize: 11 }}>{error}</div>}
            <div onClick={adjustQuantity} style={{ ...btn, textAlign: 'center', justifyContent: 'center', display: 'flex', background: adjustMode === 'remove' ? 'rgba(239,68,68,0.7)' : undefined }}>
              {adjustMode === 'add' ? 'Add' : 'Remove'}
            </div>
          </div>
        </div>
      </div>, document.body)}

      {/* History Modal */}
      {historyExtra && createPortal(<div style={overlay} onClick={() => setHistoryExtra(null)}>
        <div className="modal-inner" style={{ ...modal, width: 540 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>History: {historyExtra.component_name} ({historyExtra.sku})</span>
            <span onClick={() => setHistoryExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16 }}>&times;</span>
          </div>
          <div style={{ padding: 12, maxHeight: 400, overflowY: 'auto' }}>
            {history.length === 0 && <div style={{ color: T.tx3, fontSize: 11, textAlign: 'center', padding: 20 }}>No history</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {history.length > 0 && <thead><tr>
                <th style={th}>Action</th><th style={th}>Change</th><th style={th}>Balance</th><th style={th}>Reason</th><th style={th}>Time</th>
              </tr></thead>}
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={td}><span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: h.action === 'created' ? 'rgba(99,102,241,.12)' : h.action === 'added' ? 'rgba(34,197,94,.12)' : h.action === 'used' ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.12)',
                      color: h.action === 'created' ? T.ac2 : h.action === 'added' ? T.gr : h.action === 'used' ? T.yl : T.re,
                    }}>{h.action.toUpperCase()}</span></td>
                    <td style={{ ...td, fontFamily: T.mono, color: h.quantity_change > 0 ? T.gr : T.re }}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{h.quantity_after}</td>
                    <td style={{ ...td, fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.reason || '--'}</td>
                    <td style={{ ...td, fontSize: 10, whiteSpace: 'nowrap' }}>{h.created_at ? new Date(h.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>, document.body)}

      {/* Matches Modal */}
      {matchExtra && createPortal(<div style={overlay} onClick={() => setMatchExtra(null)}>
        <div className="modal-inner" style={{ ...modal, width: 520 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Matching Unsorted Items</span>
            <span onClick={() => setMatchExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16 }}>&times;</span>
          </div>
          <div style={{ padding: 10, fontSize: 11, color: T.tx2, borderBottom: `1px solid ${T.bd}`, background: 'rgba(245,158,11,.03)' }}>
            Extra: {matchExtra.component_name} | SKU: {matchExtra.sku} | Size: {matchExtra.size} | Qty available: <b style={{ color: T.gr }}>{matchExtra.quantity}</b>
          </div>
          <div style={{ padding: 12, maxHeight: 400, overflowY: 'auto' }}>
            {matches.length === 0 && <div style={{ color: T.tx3, fontSize: 11, textAlign: 'center', padding: 20 }}>No matching items</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {matches.length > 0 && <thead><tr>
                <th style={th}>Batch #</th><th style={th}>SKU</th><th style={th}>Size</th><th style={th}>Location</th><th style={th}>Action</th>
              </tr></thead>}
              <tbody>
                {matches.map(m => (
                  <tr key={m.id}>
                    <td style={{ ...td, fontFamily: T.mono, fontSize: 10, color: T.tx }}>{m.batch_number || '--'}</td>
                    <td style={{ ...td, fontFamily: T.mono, fontSize: 10 }}>{m.serial_number}</td>
                    <td style={td}>{m.size}</td>
                    <td style={td}>{m.location || '--'}</td>
                    <td style={td}>
                      {matchExtra.quantity > 0 ? (
                        <span onClick={() => setCompleteItem({ extra: matchExtra, item: m })}
                          style={{ ...btn, padding: '3px 10px', fontSize: 10, cursor: 'pointer' }}>Use Extra</span>
                      ) : <span style={{ fontSize: 10, color: T.re }}>No stock</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>, document.body)}

      {/* Complete Confirmation Modal */}
      {completeItem && createPortal(<div style={overlay} onClick={() => setCompleteItem(null)}>
        <div className="modal-inner" style={{ ...modal, width: 400 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.yl }}>Confirm Completion</span>
          </div>
          <div style={{ padding: 18, fontSize: 12, color: T.tx2, lineHeight: 1.8 }}>
            Use 1 x <b style={{ color: T.tx }}>{completeItem.extra.component_name}</b> to complete
            batch <b style={{ color: T.tx }}>#{completeItem.item.batch_number || 'N/A'}</b>
            (SKU: {completeItem.item.serial_number}, Size: {completeItem.item.size})?
            <br/><br/>
            Extra quantity will reduce from <b style={{ color: T.gr }}>{completeItem.extra.quantity}</b> to <b style={{ color: T.yl }}>{completeItem.extra.quantity - 1}</b>.
          </div>
          {error && <div style={{ padding: '0 18px 10px', color: T.re, fontSize: 11 }}>{error}</div>}
          <div style={{ padding: '0 18px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <div onClick={() => setCompleteItem(null)} style={btnGhost}>Cancel</div>
            <div onClick={completeWithExtra} style={{ ...btn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Processing...' : 'Confirm'}</div>
          </div>
        </div>
      </div>, document.body)}
    </div>
  );
}
