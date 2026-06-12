import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/friendlyError';
import { numericKeyDown } from '../lib/numericInput';
import { printOrQueue } from '../lib/printQueue';
import { useDebouncedFetch } from '../hooks/useDebouncedFetch';

import { T, S } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import SwipeRow from '../components/ui/SwipeRow';
import { SkeletonRows } from '../components/ui/Skeleton';
import type {
  Product,
  ProductComponent,
  InventoryItem,
  ItemComponent,
  InventoryExtra,
} from '../types/database';

const EXTRAS_LIMIT = 1000;
const SIZES = ['N/A', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Semi-Stitched'];
import { isDupatta, isLehenga, isBottomType, isBlouse, mfrFromSku } from '../lib/garmentHelpers';

// View model: narrowed inventory_items row for the matching UI.
type InventoryItemMatch = Pick<InventoryItem, 'id' | 'batch_number' | 'serial_number' | 'size' | 'location' | 'status'>;

export default function InventoryExtras() {
  const { profile } = useAuth();
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);
  const { addToast } = useNotifications();
  const [extras, setExtras] = useState<InventoryExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const skuTimer = useRef<ReturnType<typeof setTimeout>>();
  const [catFilter, setCatFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [exportHtml, setExportHtml] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingExtra, setEditingExtra] = useState<InventoryExtra | null>(null);
  const [editForm, setEditForm] = useState({ sku: '', size: '', location: '', manufacturer: '', notes: '' });
  // Add form
  const resetAddForm = () => { setFProductId(''); setFComponentId(''); setFSku(''); setFSize(''); setFLocation(''); setFManufacturer(''); setFQty('1'); setFNotes(''); };
  const [fProductId, setFProductId] = useState('');
  const [fComponentId, setFComponentId] = useState('');
  const [fSku, setFSku] = useState('');
  const [fSkuSuggestions, setFSkuSuggestions] = useState<string[]>([]);
  const [showSkuDrop, setShowSkuDrop] = useState(false);
  const [fSize, setFSize] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [fManufacturer, setFManufacturer] = useState('');
  const [mfrOptions, setMfrOptions] = useState<string[]>([]);
  const [fQty, setFQty] = useState('1');
  const [fNotes, setFNotes] = useState('');
  const [fComps, setFComps] = useState<ProductComponent[]>([]);
  // Adjust qty
  const [adjustExtra, setAdjustExtra] = useState<InventoryExtra | null>(null);
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  // Matches
  const [matchExtra, setMatchExtra] = useState<InventoryExtra | null>(null);
  const [matches, setMatches] = useState<InventoryItemMatch[]>([]);
  const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
  // Complete confirm
  const [completeItem, setCompleteItem] = useState<{ extra: InventoryExtra; item: InventoryItemMatch } | null>(null);

  useEffect(() => {
    const hasModal = showAdd || !!adjustExtra || !!matchExtra || !!completeItem || !!editingExtra || !!exportHtml;
    document.body.classList.toggle('modal-open', hasModal);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showAdd, adjustExtra, matchExtra, completeItem, editingExtra, exportHtml]);

  useEffect(() => () => { if (skuTimer.current) clearTimeout(skuTimer.current); }, []);

  const fetchExtras = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('inventory_extras').select('id, product_id, product_name, component_id, component_name, sku, size, location, manufacturer, quantity, notes, created_by, created_at, updated_at').order('updated_at', { ascending: false }).limit(EXTRAS_LIMIT);
      if (error) { addToast(friendlyError(error), 'error'); return; }
      setExtras(data || []);
      const counts: Record<string, number> = {};
      const { data: unsorted, error: e2 } = await supabase.from('inventory_items').select('id, serial_number, size, product_id').eq('status', 'unsorted');
      if (e2) { addToast(friendlyError(e2), 'error'); return; }
      const { data: allComps, error: e3 } = await supabase.from('item_components').select('inventory_item_id, component_id, status');
      if (e3) { addToast(friendlyError(e3), 'error'); return; }
      const missingMap: Record<string, Set<string>> = {};
      type ItemCompsRow = Pick<ItemComponent, 'inventory_item_id' | 'component_id' | 'status'>;
      (allComps as ItemCompsRow[] | null || []).forEach((ic) => { if (ic.status === 'missing' || ic.status === 'damaged') { if (!missingMap[ic.inventory_item_id]) missingMap[ic.inventory_item_id] = new Set(); missingMap[ic.inventory_item_id].add(ic.component_id); } });
      for (const ex of (data || [])) {
        // Out-of-stock extras can't complete anything — no matches offered
        if (ex.quantity < 1) { counts[ex.id] = 0; continue; }
        counts[ex.id] = (unsorted || []).filter(it =>
          it.serial_number === ex.sku && it.product_id === ex.product_id &&
          (ex.size === 'N/A' || !ex.size || (it.size || 'N/A') === ex.size) &&
          missingMap[it.id]?.has(ex.component_id)
        ).length;
      }
      setMatchCounts(counts);
    } finally { setLoading(false); }
  }, []);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase.from('products').select('id, name, sku, total_components, is_active, category, description, created_by, created_at, updated_at').eq('is_active', true).order('name');
    if (error) addToast(friendlyError(error), 'error');
    setProducts(data || []);
  }, []);

  useEffect(() => {
    fetchExtras(); fetchProducts();
    supabase.from('locations').select('id, name').order('name').then(({ data, error }) => { if (error) addToast('Failed to load locations — ' + friendlyError(error), 'error'); setLocations(data || []); });
    supabase.from('inventory_extras').select('manufacturer').gt('manufacturer', '').then(({ data }) => { const unique = [...new Set((data || []).map(d => d.manufacturer).filter(Boolean))].sort(); setMfrOptions(unique); });
  }, [fetchExtras, fetchProducts]);

  // Realtime — UPDATE debounced, INSERT/DELETE immediate
  const { debounced: debouncedFetchExtras } = useDebouncedFetch(fetchExtras, 500);
  useEffect(() => {
    const imm = () => fetchExtras();
    const ch = supabase.channel('extras-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_extras' }, imm)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventory_extras' }, imm)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory_extras' }, debouncedFetchExtras)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchExtras, debouncedFetchExtras]);

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
    supabase.from('components').select('id, name, product_id, component_code, description, is_critical, created_at').eq('product_id', fProductId).order('name').then(({ data, error }) => { if (error) addToast('Failed to load components — ' + friendlyError(error), 'error'); setFComps(data || []); });
  }, [fProductId]);

  // Auto-set size for dupatta components
  useEffect(() => {
    if (!fComponentId) return;
    const comp = fComps.find(c => c.id === fComponentId);
    if (comp && isDupatta(comp.name)) setFSize('N/A');
    else if (fSize === 'N/A') setFSize('');
  }, [fComponentId, fComps, fSize]);

  const loadMatches = async (ex: InventoryExtra) => {
    let q = supabase.from('inventory_items').select('id, batch_number, serial_number, size, location, status')
      .eq('status', 'unsorted').eq('serial_number', ex.sku).eq('product_id', ex.product_id);
    if (ex.size && ex.size !== 'N/A') q = q.eq('size', ex.size);
    const { data: candidates, error: cErr } = await q;
    if (cErr) { setError('Failed to load matches: ' + friendlyError(cErr)); setMatches([]); return; }
    const { data: comps, error: compErr } = await supabase.from('item_components').select('inventory_item_id, component_id, status').in('inventory_item_id', (candidates || []).map(c => c.id));
    if (compErr) { setError('Failed to load matches: ' + friendlyError(compErr)); setMatches([]); return; }
    type ItemCompsRow = Pick<ItemComponent, 'inventory_item_id' | 'component_id' | 'status'>;
    const hasMissing = new Set((comps as ItemCompsRow[] | null || []).filter((c) => (c.status === 'missing' || c.status === 'damaged') && c.component_id === ex.component_id).map((c) => c.inventory_item_id));
    setMatches(((candidates as InventoryItemMatch[] | null) || []).filter(c => hasMissing.has(c.id)));
    setMatchExtra(ex);
  };

  const openEdit = (ex: InventoryExtra) => {
    setEditingExtra(ex);
    setEditForm({ sku: ex.sku, size: ex.size, location: ex.location, manufacturer: ex.manufacturer, notes: ex.notes || '' });
    setError('');
  };

  const saveEdit = async () => {
    if (!editingExtra || saving) return;
    if (!canEdit) { addToast('You do not have permission to edit spare parts', 'error'); return; }
    if (!editForm.sku.trim() || !editForm.size || !editForm.location || !editForm.manufacturer.trim()) {
      setError('All mandatory fields (*) are required'); return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('inventory_extras').update({
      sku: editForm.sku.trim(), size: editForm.size, location: editForm.location,
      manufacturer: editForm.manufacturer.trim(), notes: editForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editingExtra.id);
    if (err) { setSaving(false); setError(friendlyError(err)); return; }
    setSaving(false); setError('');
    setEditingExtra(null); addToast('Spare part updated', 'success'); fetchExtras();
  };

  const addExtra = async () => {
    setError('');
    if (!canEdit) { addToast('You do not have permission to add spare parts', 'error'); return; }
    if (!fProductId || !fComponentId || !fSku.trim() || !fSize || !fLocation || !fManufacturer.trim()) { setError('All mandatory fields (*) are required'); return; }
    const comp = fComps.find(c => c.id === fComponentId);
    const compIsDupatta = comp && isDupatta(comp.name);
    const compIsLehenga = comp && isLehenga(comp.name);
    const compIsBottom = comp && isBottomType(comp.name);
    if (compIsDupatta && fSize !== 'N/A') { setError('Dupatta must have size "N/A"'); return; }
    if (!compIsDupatta && fSize === 'N/A') { setError('N/A is only allowed for Dupatta/Orhni/Chunni/Stole'); return; }
    const compIsBlouse = comp && isBlouse(comp.name);
    if (fSize === 'Semi-Stitched' && !compIsLehenga && !compIsBlouse) { setError('Semi-Stitched is only allowed for Lehenga or Blouse'); return; }
    if (compIsBottom && (fSize === 'N/A' || fSize === 'Semi-Stitched')) { setError('Bottom/Pant requires a specific size (not N/A or Semi-Stitched)'); return; }
    const qty = parseInt(fQty) || 0;
    if (qty < 1) { setError('Initial quantity must be at least 1 (cannot be zero)'); return; }
    setSaving(true);
    const prod = products.find(p => p.id === fProductId);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: err } = await supabase.from('inventory_extras').insert({
      product_id: fProductId, product_name: prod?.name || '', component_id: fComponentId,
      component_name: comp?.name || '', sku: fSku.trim(), size: fSize, location: fLocation,
      manufacturer: fManufacturer.trim(), quantity: qty, notes: fNotes.trim() || null, created_by: user?.id,
    }).select().maybeSingle();
    if (err || !data) {
      if (err?.code === '23505') setError('This exact extra (category+component+SKU+size) already exists');
      else setError(err ? friendlyError(err) : 'Save failed');
      setSaving(false); return;
    }
    // History entry
    const { error: histErr } = await supabase.from('inventory_extras_history').insert({
      extra_id: data.id, action: 'created', quantity_change: qty, quantity_after: qty, user_id: user?.id,
    });
    if (histErr) setError('Extra created but history log failed — ' + friendlyError(histErr));
    setSaving(false); setShowAdd(false); addToast('Spare part added', 'success');
    resetAddForm();
    fetchExtras();
  };

  const adjustQuantity = async () => {
    if (!adjustExtra || saving) return;
    if (!canEdit) { addToast('You do not have permission to adjust quantities', 'error'); return; }
    const qty = parseInt(adjustQty) || 0;
    if (qty < 1) return;
    setSaving(true);
    const newQty = adjustMode === 'add' ? adjustExtra.quantity + qty : adjustExtra.quantity - qty;
    if (newQty < 0) { setSaving(false); setError('Cannot go below 0'); return; }
    // Qty 0 rows are KEPT (shown as "Out of stock") — deleting them orphaned
    // the usage history and made completed-via-extra items unrevertable.
    const { data: updated, error: upErr } = await supabase.from('inventory_extras')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', adjustExtra.id)
      .eq('quantity', adjustExtra.quantity)
      .select().single();
    if (upErr || !updated) { setSaving(false); setError('Another user just updated this extra. Close and reopen to retry.'); return; }
    setSaving(false); setAdjustExtra(null); setAdjustQty('1'); setAdjustReason(''); addToast('Quantity adjusted', 'success'); setPage(0); fetchExtras();
  };

  const completeWithExtra = async () => {
    if (!completeItem) return;
    if (!canEdit) { addToast('You do not have permission to complete items', 'error'); return; }
    const { extra, item } = completeItem;
    if (extra.quantity < 1) { setError('No quantity available'); return; }
    setSaving(true);
    // Atomic RPC: decrements extra, verifies item, marks complete, fills
    // component, and writes activity log — all in one transaction.
    const { error } = await supabase.rpc('complete_item_with_extra', {
      p_extra_id: extra.id,
      p_item_id: item.id,
      p_reason: null,
    });
    if (error) { setError(friendlyError(error)); setSaving(false); return; }
    // Qty 0 rows are kept (shown as "Out of stock") so the completion stays
    // revertable and the usage history keeps its FK.
    setSaving(false); setCompleteItem(null); setMatchExtra(null); addToast('Item completed', 'success'); setPage(0); fetchExtras();
  };

  // Filtered list + pagination
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const filtered = extras.filter(ex => {
    if (catFilter !== 'all' && ex.product_id !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ex.sku.toLowerCase().includes(q) || ex.product_name.toLowerCase().includes(q) || ex.component_name.toLowerCase().includes(q);
    }
    return true;
  });
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  // Shared styles
  const label: React.CSSProperties = { ...S.fLabel, display: 'block', marginBottom: 4 };
  const input: React.CSSProperties = S.fInput;
  const btn: React.CSSProperties = S.btnPrimary;
  const btnGhost: React.CSSProperties = { ...S.btnGhost, cursor: 'pointer' };
  const overlay: React.CSSProperties = S.modalOverlay;
  const modal: React.CSSProperties = S.modalBox;
  const th: React.CSSProperties = S.thStyle;
  const td: React.CSSProperties = S.tdStyle;

  return (
    <div className="page-pad" style={{ animation: 'fi .3s ease both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: T.tx3 }}>{filtered.length} items{catFilter !== 'all' ? ' (filtered)' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
          <button onClick={() => setShowExportMenu(v => !v)} style={btnGhost} title="Export options" aria-label="Export options">Export ▾</button>
          {showExportMenu && <><div style={{ position: 'fixed', inset: 0, zIndex: 149 }} onClick={() => setShowExportMenu(false)} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'rgba(14,18,30,.97)', backdropFilter: 'blur(20px)', border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 150, minWidth: 160, overflow: 'hidden' }}>
            <button onClick={() => {
              if (filtered.length === 0) { addToast('No data to export', 'error'); setShowExportMenu(false); return; }
              const csv = 'SKU,Category,Component,Size,Qty\n' + filtered.map(ex => `${ex.sku},"${ex.product_name}",${ex.component_name},${ex.size},${ex.quantity}`).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Extras_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
              setShowExportMenu(false);
            }} style={{ padding: '12px 14px', fontSize: 12, color: T.tx, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: 'transparent', border: 'none', width: '100%', fontFamily: T.sans }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>CSV Download</button>
            <button onClick={() => {
              setShowExportMenu(false);
            if (filtered.length === 0) return;
            const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
            const rows = filtered.map(ex => `<tr><td>${esc(ex.sku)}</td><td>${esc(ex.product_name)}</td><td>${esc(ex.component_name)}</td><td>${esc(ex.size)}</td><td>${esc(ex.location)}</td><td style="text-align:right;font-weight:600">${ex.quantity}</td></tr>`).join('');
            setExportHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spare Parts</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#060810;color:#E2E8F0;padding:16px;padding-bottom:80px;-webkit-text-size-adjust:100%}.header{margin-bottom:16px}.brand{display:flex;align-items:center;gap:10px;margin-bottom:10px}.logo{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#6366F1,#38BDF8);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff}.title{font-size:15px;font-weight:700;letter-spacing:-0.3px}.sub{font-size:10px;color:#6B7890;letter-spacing:0.5px}.meta{display:flex;gap:12px;font-size:10px;color:#8896B0;margin-top:8px}.meta span{padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}table{width:100%;border-collapse:collapse;margin-top:4px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.06)}th{background:rgba(255,255,255,.03);font-size:9px;font-weight:600;color:#6B7890;text-transform:uppercase;letter-spacing:0.8px;padding:10px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}td{padding:9px 10px;font-size:11px;color:#8896B0;border-bottom:1px solid rgba(255,255,255,.04)}tr:nth-child(even) td{background:rgba(255,255,255,.015)}.footer{text-align:center;font-size:8px;color:#4A5568;margin-top:16px;letter-spacing:1px;text-transform:uppercase}.no-print{display:none}@page{size:A4;margin:8mm}@media print{body{background:#fff;color:#222;padding:8mm}th{background:#f5f5f5;color:#333}td{color:#444;border-color:#eee}.footer{color:#999}}</style></head><body><div class="header"><div class="brand"><div class="logo">D</div><div><div class="title">Spare Parts Report</div><div class="sub">Arya Designs</div></div></div><div class="meta"><span>${filtered.length} items</span><span>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div></div><table><thead><tr><th>SKU</th><th>Category</th><th>Component</th><th>Size</th><th>Location</th><th style="text-align:right">Qty</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Powered by DailyOffice</div></body></html>`);
          }} style={{ padding: '12px 14px', fontSize: 12, color: T.tx, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: 'transparent', border: 'none', width: '100%', fontFamily: T.sans }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>Print / PDF</button>
          </div></>}
          {canEdit && <button onClick={() => setShowAdd(true)} style={{ ...btn, border: 'none' }}>+ Add</button>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="inv-extra-filters" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input placeholder="Search SKU, category, component..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{ ...S.fSearch, background: 'transparent', border: 'none' }} />
        </div>
        <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0); }}
          style={{ background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 11, padding: '6px 10px', outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <option value="all">All Categories</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
        </select>
        {(search || catFilter !== 'all') && <button onClick={() => { setSearch(''); setCatFilter('all'); setPage(0); }} style={{ ...S.btnGhost, ...S.btnSm }}>Clear</button>}
      </div>

      {loading && extras.length === 0 && <SkeletonRows rows={6} />}

      {/* Desktop Table */}
      <div className="inv-extra-desktop" style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>SKU</th><th style={th}>Category</th><th style={th}>Component</th>
            <th style={th}>Size</th><th style={th}>Qty</th><th style={th}>Matches</th><th style={th}>Actions</th>
          </tr></thead>
          <tbody>
            {paged.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 30, color: T.tx3 }}>No spare parts found</td></tr>}
            {paged.map(ex => (
              <tr key={ex.id} style={{ transition: 'background 150ms' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ ...td, fontFamily: T.mono, fontSize: 11, color: T.tx }}>{ex.sku}</td>
                <td style={td}>{ex.product_name}{(() => { const p = products.find(pr => pr.id === ex.product_id); return p?.sku ? <span style={{ marginLeft: 4, fontSize: 9, color: T.tx3, fontFamily: T.mono }}>({p.sku})</span> : null; })()}</td>
                <td style={td}>{ex.component_name}</td>
                <td style={td}>{ex.size}</td>
                <td style={{ ...td, fontWeight: 600, color: ex.quantity > 0 ? T.gr : T.re }}>{ex.quantity}{ex.quantity < 1 && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', background: 'rgba(239,68,68,.10)', color: T.re }}>Out of stock</span>}</td>
                <td style={td}>
                  {(matchCounts[ex.id] || 0) > 0 ? (
                    <button onClick={() => loadMatches(ex)} style={{ color: T.yl, cursor: 'pointer', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', padding: 0, fontFamily: T.sans }} title="View matching items" aria-label={`${matchCounts[ex.id]} match${matchCounts[ex.id] > 1 ? 'es' : ''}`}>
                      {matchCounts[ex.id]} match{matchCounts[ex.id] > 1 ? 'es' : ''}
                    </button>
                  ) : <span style={{ color: T.tx3, fontSize: 10 }}>--</span>}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {canEdit ? <><button onClick={() => openEdit(ex)} style={{ ...S.btnGhost, ...S.btnSm }} title="Edit spare part" aria-label="Edit spare part">Edit</button>{' '}
                  <button onClick={() => { setAdjustExtra(ex); setAdjustMode('add'); }} style={{ ...S.btnSuccess, ...S.btnSm }} title="Add quantity" aria-label="Add quantity">Add</button>{' '}
                  <button onClick={() => { setAdjustExtra(ex); setAdjustMode('remove'); }} style={{ ...S.btnDanger, ...S.btnSm }} title="Remove quantity" aria-label="Remove quantity">Remove</button></> : <span style={{ color: T.tx3, fontSize: 10 }}>--</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="inv-extra-mobile">
        {paged.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No spare parts found</div>}
        {paged.map((ex, idx) => (
          <SwipeRow key={ex.id} hint={idx === 0 && !!canEdit} hintKey="spare-parts" actions={canEdit ? [
            { label: 'Edit', color: '#6366F1', onClick: () => openEdit(ex) },
            { label: 'Add', color: '#22C55E', onClick: () => { setAdjustExtra(ex); setAdjustMode('add'); } },
            { label: 'Remove', color: '#EF4444', onClick: () => { setAdjustExtra(ex); setAdjustMode('remove'); } },
          ] : []}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.bd}` }} onClick={() => (matchCounts[ex.id] || 0) > 0 ? loadMatches(ex) : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2, fontWeight: 600 }}>{ex.sku}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.tx, marginTop: 2 }}>{ex.product_name} · {ex.component_name}</div>
                  <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{ex.size || '—'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: ex.quantity > 0 ? T.gr : T.re }}>{ex.quantity}</div>
                  {ex.quantity < 1 && <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: T.re, marginTop: 2 }}>Out of stock</div>}
                  {(matchCounts[ex.id] || 0) > 0 && <div style={{ fontSize: 10, color: T.yl, fontWeight: 600, marginTop: 2 }}>{matchCounts[ex.id]} match{matchCounts[ex.id] > 1 ? 'es' : ''}</div>}
                </div>
              </div>
            </div>
          </SwipeRow>
        ))}
      </div>

      {extras.length === EXTRAS_LIMIT && <div style={{ fontSize: 11, color: T.yl, padding: '8px 14px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 6, marginTop: 8, textAlign: 'center' }}>Showing first {EXTRAS_LIMIT} items. Use search to find more.</div>}

      {/* Pagination */}
      {totalPages > 1 && <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setPage(Math.max(0, page - 1))} style={{ ...S.btnGhost, ...S.btnSm, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }} aria-label="Previous page">Prev</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ ...S.btnGhost, ...S.btnSm, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }} aria-label="Next page">Next</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{filtered.length} items</span>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, outline: 'none' }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>}

      {/* Add Spare Part Modal */}
      {showAdd && createPortal(<div style={overlay} onClick={() => { setShowAdd(false); setError(''); }}>
        <div className="modal-inner" style={modal} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Add Spare Part</span>
          </div>
          <form onSubmit={e => { e.preventDefault(); addExtra(); }} style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Category * <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 8, color: T.tx3 }}>Select product category</span></label>
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
            <div className="inv-extra-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <label style={label}>SKU *</label>
                <input value={fSku} onChange={e => { const v = e.target.value; setFSku(v); const autoMfr = mfrFromSku(v); if (autoMfr && (!fManufacturer || mfrFromSku(fSku) === fManufacturer)) setFManufacturer(autoMfr); clearTimeout(skuTimer.current); skuTimer.current = setTimeout(() => searchSkus(v), 300); }} onFocus={() => { if (fSkuSuggestions.length > 0) setShowSkuDrop(true); }} onBlur={() => setTimeout(() => setShowSkuDrop(false), 150)} placeholder="e.g. SW-1234" style={{ ...input, fontFamily: T.mono }} autoComplete="off" />
                {showSkuDrop && fSkuSuggestions.length > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 6, maxHeight: 140, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,.3)' }}>
                  {fSkuSuggestions.map(s => <div key={s} onMouseDown={() => { setFSku(s); const autoMfr = mfrFromSku(s); if (autoMfr && (!fManufacturer || mfrFromSku(fSku) === fManufacturer)) setFManufacturer(autoMfr); setShowSkuDrop(false); }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: T.mono, color: T.ac2, borderBottom: `1px solid ${T.bd}` }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{s}</div>)}
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
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Location *</label>
              <select value={fLocation} onChange={e => setFLocation(e.target.value)} style={input}>
                <option value="">Select location</option>
                {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>Manufacturer *</label>
              <input list="mfr-extras-list" value={fManufacturer} onChange={e => setFManufacturer(e.target.value)} placeholder="Type or select manufacturer..." style={input} />
              <datalist id="mfr-extras-list">{mfrOptions.map(m => <option key={m} value={m} />)}</datalist>
            </div>
            <div className="inv-extra-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={label}>Initial Quantity</label>
                <input type="number" min="1" step="1" value={fQty} onKeyDown={e => numericKeyDown(e)} onChange={e => setFQty(e.target.value)} placeholder="0" style={input} />
              </div>
              <div>
                <label style={label}>Notes</label>
                <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Optional" style={input} />
              </div>
            </div>
            {error && <div style={{ color: T.re, fontSize: 11, marginBottom: 8 }}>{error}</div>}
            <div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
              <span onClick={() => { setShowAdd(false); setError(''); }} style={btnGhost}>Cancel</span>
              <button type="submit" style={{ ...btn, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Saving...' : 'Add'}</button>
            </div>
          </form>
        </div>
      </div>, document.body)}

      {/* Adjust Quantity Modal */}
      {adjustExtra && createPortal(<div style={overlay} onClick={() => setAdjustExtra(null)}>
        <div className="modal-inner" style={{ ...modal, width: 380 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{adjustMode === 'add' ? 'Add' : 'Remove'} Quantity</span>
            <button onClick={() => setAdjustExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16, background: 'none', border: 'none' }} title="Close" aria-label="Close">&times;</button>
          </div>
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: T.tx2 }}>
              {adjustExtra.component_name} ({adjustExtra.sku}, {adjustExtra.size})
              <br/>Current: <span style={{ color: T.gr, fontWeight: 600 }}>{adjustExtra.quantity}</span>
            </div>
            <div><label style={label}>How many to {adjustMode}?</label>
              <input type="number" min="1" step="1" value={adjustQty} onKeyDown={e => numericKeyDown(e)} onChange={e => setAdjustQty(e.target.value)} placeholder="0" style={input} /></div>
            <div><label style={label}>Reason (optional)</label>
              <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Found more stock" style={input} /></div>
            {error && <div style={{ color: T.re, fontSize: 11 }}>{error}</div>}
            <button onClick={adjustQuantity} style={{ ...btn, textAlign: 'center', justifyContent: 'center', display: 'flex', border: 'none', background: adjustMode === 'remove' ? 'rgba(239,68,68,0.7)' : undefined, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>
              {saving ? 'Saving…' : adjustMode === 'add' ? 'Add' : 'Remove'}
            </button>
          </div>
        </div>
      </div>, document.body)}

      {/* Matches Modal */}
      {matchExtra && createPortal(<div style={overlay} onClick={() => setMatchExtra(null)}>
        <div className="modal-inner" style={{ ...modal, width: 520 }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Matching Unsorted Items</span>
            <button onClick={() => setMatchExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16, background: 'none', border: 'none' }} title="Close" aria-label="Close">&times;</button>
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
                        <button onClick={() => setCompleteItem({ extra: matchExtra, item: m })}
                          style={{ ...btn, padding: '3px 10px', fontSize: 10, border: 'none' }} title="Use this spare part" aria-label="Use spare part">Use</button>
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
            {completeItem.extra.quantity <= 1 && <><br/><br/><span style={{ color: T.yl, fontSize: 11 }}>This is the last piece — the extra row will be removed after use.</span></>}
          </div>
          {error && <div style={{ padding: '0 18px 10px', color: T.re, fontSize: 11 }}>{error}</div>}
          <div style={{ padding: '0 18px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setCompleteItem(null)} style={btnGhost}>Cancel</button>
            <button onClick={completeWithExtra} style={{ ...btn, border: 'none', opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Processing...' : 'Confirm'}</button>
          </div>
        </div>
      </div>, document.body)}
      {editingExtra && createPortal(<div style={overlay} onClick={() => setEditingExtra(null)}>
        <div className="modal-inner" style={modal} onClick={e => e.stopPropagation()}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>Edit Spare Part</span>
            <button onClick={() => setEditingExtra(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 16, background: 'none', border: 'none' }} title="Close" aria-label="Close">&times;</button>
          </div>
          <div style={{ padding: 16 }}>
            {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.re, marginBottom: 10 }}>{error}</div>}
            <div style={{ marginBottom: 8, fontSize: 10, color: T.tx3 }}>{editingExtra.product_name} · {editingExtra.component_name}</div>
            <div className="inv-extra-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={label}>SKU *</label><input value={editForm.sku} onChange={e => setEditForm({ ...editForm, sku: e.target.value })} style={{ ...input, fontFamily: T.mono }} /></div>
              <div><label style={label}>Size *</label><select value={editForm.size} onChange={e => setEditForm({ ...editForm, size: e.target.value })} style={input}><option value="">Select...</option>{SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={label}>Location *</label><select value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })} style={input}><option value="">Select...</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div>
            <div style={{ marginBottom: 10 }}><label style={label}>Manufacturer *</label><input list="mfr-edit-list" value={editForm.manufacturer} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} style={input} /><datalist id="mfr-edit-list">{mfrOptions.map(m => <option key={m} value={m} />)}</datalist></div>
            <div style={{ marginBottom: 12 }}><label style={label}>Notes</label><input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional" style={input} /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <span onClick={() => setEditingExtra(null)} style={btnGhost}>Cancel</span>
              <span onClick={saveEdit} style={{ ...btn, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Updating…' : 'Update'}</span>
            </div>
          </div>
        </div>
      </div>, document.body)}

      {exportHtml && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd}`, background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Export Preview</span>
            <button onClick={() => setExportHtml(null)} style={{ width: 44, height: 44, borderRadius: 8, border: `1px solid ${T.bd}`, background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
          </div>
          <iframe srcDoc={exportHtml} style={{ flex: 1, border: 'none', width: '100%', background: T.bg }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: `1px solid ${T.bd}`, display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setExportHtml(null)} style={{ ...S.btnGhost, flex: 1, maxWidth: 160 }}>Close</button>
            <button onClick={() => printOrQueue('document', exportHtml!, 'A4', 'Spare Parts Export', undefined, addToast)} style={{ ...S.btnPrimary, padding: '10px 24px', fontSize: 13, flex: 1, maxWidth: 160 }}>Print / Share</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
