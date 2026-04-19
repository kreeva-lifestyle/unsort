// Inventory page — CRUD, pair completion, smart intel, extras integration
import React, { useState, useEffect, useId } from 'react';
import JsBarcode from 'jsbarcode';
import { supabase } from '../lib/supabase';
import { T, S, Icon } from '../lib/theme';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import InventoryExtras from '../InventoryExtras';

const statusTag = (status: string) => {
  const m: Record<string, { bg: string; color: string; bd: string }> = {
    complete: { bg: 'rgba(34,197,94,0.10)', color: '#4ADE80', bd: 'rgba(34,197,94,0.25)' },
    completed: { bg: 'rgba(34,197,94,0.15)', color: '#4ADE80', bd: 'rgba(34,197,94,0.30)' },
    damaged: { bg: 'rgba(239,68,68,0.10)', color: '#FCA5A5', bd: 'rgba(239,68,68,0.25)' },
    unsorted: { bg: 'rgba(245,158,11,0.10)', color: '#FCD34D', bd: 'rgba(245,158,11,0.25)' },
    dry_clean: { bg: 'rgba(56,189,248,0.10)', color: '#7DD3FC', bd: 'rgba(56,189,248,0.25)' },
  };
  const s = m[status] || m.unsorted;
  return { display: 'inline-flex' as const, alignItems: 'center' as const, gap: 4, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.bd}`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
};


const MARKETPLACES = ['Myntra-Fusionic', 'Ajio-Fusionic', 'Tanuka', 'Svaraa', 'Amazon'];
const SIZES = ['N/A', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size', 'Semi-Stitched'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const canAlterSize = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a === 'Semi-Stitched' || b === 'Semi-Stitched') return true;
  if (a === 'N/A' || b === 'N/A') return true;
  const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return false;
  return Math.abs(ai - bi) === 1;
};
const isDupatta = (name: string) => /dup+at*a|orhni|chunni|stole/i.test(name);
const isLehenga = (name: string) => /lehenga|lehnga|ghaghra/i.test(name);
const isBottomType = (name: string) => /bottom|pant|trouser|skirt|salwar|churidar|palazzo/i.test(name);

export default function Inventory({ globalSearch = '', openItemId, onItemOpened, active }: { globalSearch?: string; openItemId?: string | null; onItemOpened?: () => void; active?: boolean }) {
  const [stage, setStage] = useState<'pending' | 'completed'>('pending');
  const instanceId = useId();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [itemTags, setItemTags] = useState<Record<string, any[]>>({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [mpFilter, setMpFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const [form, setForm] = useState({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' });
  const [catSearch, setCatSearch] = useState('');
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [showSkuDrop, setShowSkuDrop] = useState(false);
  const [catComps, setCatComps] = useState<any[]>([]);
  const [missingComps, setMissingComps] = useState<Set<string>>(new Set());
  const [damagedComps, setDamagedComps] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState('');
  const [matchResult, setMatchResult] = useState<any>(null);

  const [itemMissing, setItemMissing] = useState<Record<string, string[]>>({});
  const [itemDamaged, setItemDamaged] = useState<Record<string, string[]>>({});
  const [itemPresent, setItemPresent] = useState<Record<string, Set<string>>>({});
  const [completablePairs, setCompletablePairs] = useState<Record<string, string[]>>({});
  const [showCompleteModal, setShowCompleteModal] = useState<{ itemId: string; pairId?: string } | null>(null);
  const [showIntel, setShowIntel] = useState(false);
  const [intelResults, setIntelResults] = useState<any[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [invLimit, setInvLimit] = useState(5000);
  const [invTruncated, setInvTruncated] = useState(false);

  useEffect(() => { if (active) setShowExtras(false); }, [active]);

  const fetchData = () => {
    supabase.from('inventory_items').select('*, products(name, sku, total_components)').order('created_at', { ascending: false }).limit(invLimit).then(({ data }) => { setItems(data || []); setInvTruncated((data || []).length >= invLimit); });
    supabase.from('products').select('id, name, sku, total_components, category').eq('is_active', true).then(({ data }) => setProducts(data || []));
    supabase.from('locations').select('*').order('name').then(({ data }) => setLocations(data || []));
    supabase.from('tags').select('*').order('name').then(({ data }) => setTags(data || []));
    supabase.from('item_tags').select('*, tags(id, name, color)').then(({ data }) => {
      const map: Record<string, any[]> = {};
      (data || []).forEach((it: any) => { if (!map[it.inventory_item_id]) map[it.inventory_item_id] = []; map[it.inventory_item_id].push(it.tags); });
      setItemTags(map);
    });
    supabase.from('item_components').select('inventory_item_id, component_id, status, components(name)').then(({ data }) => {
      const missingMap: Record<string, string[]> = {};
      const damagedMap: Record<string, string[]> = {};
      const presentMap: Record<string, Set<string>> = {};
      (data || []).forEach((ic: any) => {
        if (ic.status === 'missing') {
          if (!missingMap[ic.inventory_item_id]) missingMap[ic.inventory_item_id] = [];
          if (ic.components?.name) missingMap[ic.inventory_item_id].push(ic.components.name);
        }
        if (ic.status === 'damaged') {
          if (!damagedMap[ic.inventory_item_id]) damagedMap[ic.inventory_item_id] = [];
          if (ic.components?.name) damagedMap[ic.inventory_item_id].push(ic.components.name);
        }
        if (ic.status === 'present') {
          if (!presentMap[ic.inventory_item_id]) presentMap[ic.inventory_item_id] = new Set();
          presentMap[ic.inventory_item_id].add(ic.component_id);
        }
      });
      setItemMissing(missingMap); setItemDamaged(damagedMap);
      setItemPresent(presentMap);
    });
  };

  // Compute all completable pairs: must match category + SKU + size
  useEffect(() => {
    if (items.length === 0) return;
    const unsorted = items.filter(i => i.status === 'unsorted');
    const pairs: Record<string, string[]> = {};
    for (const a of unsorted) {
      const aPresent = itemPresent[a.id];
      const aMissing = itemMissing[a.id];
      if (!aMissing || aMissing.length === 0 || !aPresent) continue;
      const totalComps = a.products?.total_components || 0;
      if (totalComps === 0) continue;
      for (const b of unsorted) {
        if (a.id === b.id) continue;
        // Must match: same category, same SKU, same size
        if (a.product_id !== b.product_id) continue;
        if ((a.serial_number || '') !== (b.serial_number || '')) continue;
        const sA = a.size || 'N/A', sB = b.size || 'N/A';
        if (sA !== sB && sA !== 'N/A' && sB !== 'N/A') continue;
        const bPresent = itemPresent[b.id];
        if (!bPresent) continue;
        const union = new Set([...aPresent, ...bPresent]);
        if (union.size >= totalComps) {
          if (!pairs[a.id]) pairs[a.id] = [];
          if (!pairs[a.id].includes(b.id)) pairs[a.id].push(b.id);
        }
      }
    }
    setCompletablePairs(pairs);
  }, [items, itemMissing, itemPresent]);
  useEffect(() => {
    fetchData();
    let debounceTimer: any;
    const debouncedFetch = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fetchData, 500); };
    const ch = supabase.channel('inv-sync-' + instanceId.replace(/:/g, ''))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_components' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_tags' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, debouncedFetch)
      .subscribe();
    return () => { clearTimeout(debounceTimer); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back button support
  useEffect(() => {
    const onPop = () => { if (showExtras) setShowExtras(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showExtras]);

  // Open item detail from notification click
  useEffect(() => {
    if (!openItemId) return;
    (async () => {
      const { data: item } = await supabase.from('inventory_items').select('*, products(name, sku, total_components)').eq('id', openItemId).maybeSingle();
      if (item) { setSelected(item); await fetchComps(item.id); supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setItemLogs(data || [])); setShowCompModal(true); }
      onItemOpened?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  const fetchComps = async (id: string) => { const { data } = await supabase.from('item_components').select('*, components(name, component_code, is_critical)').eq('inventory_item_id', id); setComps(data || []); };

  const generateUniqueId = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `UNS-${dd}${mm}${yy}-${seq}`;
  };

  const updateComponentStatuses = async (inventoryItemId: string) => {
    await new Promise(r => setTimeout(r, 500));
    const { data: itemComps } = await supabase.from('item_components').select('*').eq('inventory_item_id', inventoryItemId);
    if (itemComps) {
      for (const ic of itemComps) {
        const status = damagedComps.has(ic.component_id) ? 'damaged' : missingComps.has(ic.component_id) ? 'missing' : 'present';
        await supabase.from('item_components').update({ status }).eq('id', ic.id);
      }
    }
  };

  const checkForPairMatch = async (productId: string, currentItemId: string) => {
    // Parallel fetch: current item + components + item_components
    const [{ data: currentItem }, { data: allComps }, { data: currentItemComps }] = await Promise.all([
      supabase.from('inventory_items').select('serial_number, size').eq('id', currentItemId).maybeSingle(),
      supabase.from('components').select('id').eq('product_id', productId),
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', currentItemId),
    ]);
    if (!currentItem) return;
    if (!allComps || allComps.length === 0) return;
    const allCompIds = new Set(allComps.map(c => c.id));
    if (!currentItemComps) return;
    const currentPresent = new Set(currentItemComps.filter(c => c.status === 'present').map(c => c.component_id));
    const currentMissing = new Set(currentItemComps.filter(c => c.status === 'missing').map(c => c.component_id));
    if (currentMissing.size === 0) return;

    // Find other unsorted items of the same category + SKU + size
    let query = supabase.from('inventory_items')
      .select('id, batch_number, serial_number, size, created_at')
      .eq('product_id', productId)
      .eq('status', 'unsorted')
      .neq('id', currentItemId);
    if (currentItem.serial_number) query = query.eq('serial_number', currentItem.serial_number);
    if (currentItem.size && currentItem.size !== 'N/A') query = query.eq('size', currentItem.size);
    const { data: otherItems } = await query;
    if (!otherItems || otherItems.length === 0) return;

    // Batch fetch all candidate components at once (not N+1)
    const { data: allCandidateComps } = await supabase.from('item_components').select('inventory_item_id, component_id, status').in('inventory_item_id', otherItems.map(o => o.id));
    // Get component names once
    const { data: compNameData } = await supabase.from('components').select('id, name').eq('product_id', productId);
    const nameMap = Object.fromEntries((compNameData || []).map(c => [c.id, c.name]));

    for (const other of otherItems) {
      const otherComps = (allCandidateComps || []).filter(c => c.inventory_item_id === other.id);
      const otherPresent = new Set(otherComps.filter(c => c.status === 'present').map(c => c.component_id));

      // Check if the union of present components from both items covers ALL components
      const union = new Set([...currentPresent, ...otherPresent]);
      const coversAll = [...allCompIds].every(id => union.has(id));

      if (coversAll) {
        const currentPresentNames = [...currentPresent].map(id => nameMap[id]).filter(Boolean);
        const otherPresentNames = [...otherPresent].map(id => nameMap[id]).filter(Boolean);
        const catName = products.find(p => p.id === productId)?.name || 'Unknown';

        setMatchResult({
          categoryName: catName,
          sku: currentItem.serial_number || '',
          size: currentItem.size || '',
          currentId: currentItemId,
          currentUniqueId: items.find(i => i.id === currentItemId)?.batch_number || 'Current item',
          currentPresent: currentPresentNames,
          otherId: other.id,
          otherUniqueId: other.batch_number || other.serial_number || 'Unknown',
          otherPresent: otherPresentNames,
          otherDate: new Date(other.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        });
        return; // found a match, stop searching
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.product_id) { addToast('Please select a category', 'error'); return; }
    if (selected && selected.product_id !== form.product_id) { addToast('Cannot change category on existing item. Delete and recreate instead.', 'error'); return; }
    const hasDupatta = catComps.some(c => isDupatta(c.name));
    const hasNonDupatta = catComps.some(c => !isDupatta(c.name));
    if (!form.size) { addToast('Please select a size', 'error'); return; }
    if (hasNonDupatta && form.size === 'N/A') {
      addToast('N/A is only for Dupatta-only items. Select a proper size.', 'error'); return;
    }
    if (hasDupatta && !hasNonDupatta && form.size !== 'N/A') {
      addToast('Dupatta-only items must have size N/A', 'error'); return;
    }
    if (form.size === 'Free Size' && !catComps.some(c => isLehenga(c.name))) {
      addToast('Free Size is only allowed for Lehenga', 'error'); return;
    }
    if (catComps.some(c => isBottomType(c.name)) && (form.size === 'N/A' || form.size === 'Free Size')) {
      addToast('Bottom/Pant requires a specific size (not N/A or Free Size)', 'error'); return;
    }
    if (!selected && form.status === 'unsorted' && catComps.length > 0 && missingComps.size === 0 && damagedComps.size === 0) {
      addToast('All components are present — status should be "Complete" not "Unsorted"', 'error'); return;
    }
    if (form.status === 'unsorted' && catComps.length > 0 && missingComps.size === catComps.length) {
      addToast('All components are missing — entire product is missing. Change status or deselect some.', 'error'); return;
    }
    let savedItemId = '';
    if (selected) {
      if (selected.serial_number && selected.serial_number !== form.serial_number) {
        const { count } = await supabase.from('inventory_extras').select('id', { count: 'exact', head: true }).eq('sku', selected.serial_number);
        if ((count || 0) > 0) { addToast(`Cannot change SKU — ${count} extra(s) reference "${selected.serial_number}". Update extras first.`, 'error'); return; }
      }
      const { error } = await supabase.from('inventory_items').update(form).eq('id', selected.id);
      if (error) { addToast(error.message, 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') await updateComponentStatuses(selected.id);
      savedItemId = selected.id;
      addToast('Updated!', 'success');
    } else {
      // Auto-generate unique ID and store in batch_number
      const uniqueId = generateUniqueId();
      const insertData = { ...form, batch_number: uniqueId, reported_by: profile?.id };
      const { data, error } = await supabase.from('inventory_items').insert(insertData).select().single();
      if (error || !data) { addToast(error?.message || 'Error', 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') await updateComponentStatuses(data.id);
      savedItemId = data.id;
      addToast(`Item added! ID: ${uniqueId}`, 'success');
    }
    // Save tags
    if (savedItemId && tagInput.trim()) {
      await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
      const tagNames = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      for (const name of tagNames) {
        let { data: existing } = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
        if (!existing) { const { data: created } = await supabase.from('tags').insert({ name }).select('id').single(); existing = created; }
        if (existing) await supabase.from('item_tags').insert({ inventory_item_id: savedItemId, tag_id: existing.id });
      }
    } else if (savedItemId && !tagInput.trim()) {
      await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
    }

    const savedProductId = form.product_id;
    const savedStatus = form.status;
    const hadMissing = missingComps.size > 0;
    setShowModal(false); setSelected(null); setForm({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' }); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); fetchData();

    // Check for pair matches after save (only for unsorted items with missing components)
    if (savedStatus === 'unsorted' && hadMissing) {
      setTimeout(() => checkForPairMatch(savedProductId, savedItemId), 1000);
    }
  };

  const updateComp = async (id: string, status: string) => { const { error } = await supabase.from('item_components').update({ status }).eq('id', id); if (error) addToast(error.message, 'error'); else { addToast('Updated!', 'success'); fetchComps(selected.id); fetchData(); } };

  const openEdit = async (item: any) => {
    setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', size: item.size || '', status: item.status, location: item.location || '', notes: item.notes || '', order_id: item.order_id || '', marketplace: item.marketplace || '', ticket_id: item.ticket_id || '', link: item.link || '' }); setCatSearch(item.products?.name || '');
    const { data: cc } = await supabase.from('components').select('*').eq('product_id', item.product_id);
    setCatComps(cc || []);
    const { data: ic } = await supabase.from('item_components').select('*').eq('inventory_item_id', item.id);
    const missing = new Set<string>(); const damaged = new Set<string>();
    if (ic) ic.forEach((c: any) => { if (c.status === 'missing') missing.add(c.component_id); if (c.status === 'damaged') damaged.add(c.component_id); });
    setMissingComps(missing); setDamagedComps(damaged);
    setTagInput((itemTags[item.id] || []).map((t: any) => t?.name).filter(Boolean).join(', '));
    setShowModal(true);
  };
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  const printBarcode = (uniqueId: string) => {
    const canvas = document.createElement('canvas');
    try { JsBarcode(canvas, uniqueId, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, font: 'IBM Plex Mono', margin: 10 }); } catch { return; }
    const win = window.open('', '_blank', 'width=400,height=250');
    if (!win) return;
    win.document.write(`<html><head><title>${uniqueId}</title><style>body{font-family:'IBM Plex Sans',sans-serif;text-align:center;padding:20px}@media print{.no-print{display:none}}</style></head><body><img src="${canvas.toDataURL()}" /><br><button class="no-print" onclick="window.print()" style="margin-top:16px;padding:8px 24px;font-size:14px;cursor:pointer">Print</button></body></html>`);
    win.document.close();
  };
  const openComps = async (item: any) => {
    setSelected(item); await fetchComps(item.id);
    supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setItemLogs(data || []));
    setShowCompModal(true);
  };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; timer: number } | null>(null);

  const handleDelete = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (item.paired_with) { addToast('Cannot delete — item is paired. Unpair first.', 'error'); return; }
    if (item.status === 'completed') { addToast('Cannot delete a completed item.', 'error'); return; }
    setItems(prev => prev.filter(i => i.id !== itemId));
    const timer = window.setTimeout(async () => {
      await supabase.from('item_tags').delete().eq('inventory_item_id', itemId);
      await supabase.from('item_components').delete().eq('inventory_item_id', itemId);
      await supabase.from('inventory_items').delete().eq('id', itemId);
      setPendingDelete(null);
      fetchData();
    }, 5000);
    setPendingDelete({ id: itemId, timer });
  };

  const undoDelete = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      setPendingDelete(null);
      fetchData();
    }
  };

  const handleComplete = async (itemId: string, pairId: string) => {
    const [{ data: aComps }, { data: bComps }, { data: prod }] = await Promise.all([
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', itemId),
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', pairId),
      supabase.from('inventory_items').select('product_id, products(total_components)').eq('id', itemId).maybeSingle() as any,
    ]);
    const aP = new Set((aComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const bP = new Set((bComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const union = new Set([...aP, ...bP]);
    const total = (prod as any)?.products?.total_components || 0;
    if (total > 0 && union.size < total) { addToast('Cannot complete — combined components do not cover all required parts. Data may have changed.', 'error'); setShowCompleteModal(null); fetchData(); return; }
    const { error: e1 } = await supabase.from('inventory_items').update({ status: 'completed', paired_with: pairId }).eq('id', itemId);
    const { error: e2 } = await supabase.from('inventory_items').update({ status: 'completed', paired_with: itemId }).eq('id', pairId);
    if (e1 || e2) { addToast(`Error: ${e1?.message || e2?.message}`, 'error'); return; }
    setItems(prev => prev.map(i => (i.id === itemId || i.id === pairId) ? { ...i, status: 'completed' } : i));
    addToast('Both items moved to Completed!', 'success');
    setShowCompleteModal(null);
    fetchData();
  };

  const handleCancelCompletion = async (itemId: string) => {
    // Check if completed via extra — cannot revert
    const { count: extraUsed } = await supabase.from('inventory_extras_history').select('id', { count: 'exact', head: true }).eq('related_inventory_item_id', itemId).eq('action', 'used');
    if ((extraUsed || 0) > 0) { addToast('Cannot revert — item was completed using an extra. Extra quantity was already decremented.', 'error'); return; }
    const item = items.find(i => i.id === itemId);
    const pairedId = item?.paired_with;
    const idsToRevert = [itemId];
    if (pairedId) idsToRevert.push(pairedId);

    for (const id of idsToRevert) {
      await supabase.from('inventory_items').update({ status: 'unsorted', paired_with: null }).eq('id', id);
    }
    setItems(prev => prev.map(i => idsToRevert.includes(i.id) ? { ...i, status: 'unsorted', paired_with: null } : i));
    addToast(pairedId ? 'Both paired items moved back to Inventory' : 'Item moved back to Inventory', 'success');
    fetchData();
  };

  const computeIntel = async () => {
    const unsorted = items.filter(i => i.status === 'unsorted');
    const results: any[] = [];
    const checked = new Set<string>();

    for (const a of unsorted) {
      const aMissing = itemMissing[a.id] || [];
      const aPresent = itemPresent[a.id];
      if (!aMissing.length || !aPresent) continue;

      for (const b of unsorted) {
        if (a.id === b.id) continue;
        if (a.product_id !== b.product_id) continue;
        if ((a.serial_number || '') !== (b.serial_number || '')) continue;
        // Skip if same size (normal pairing handles that)
        if ((a.size || '') === (b.size || '')) continue;
        // Must be alterable adjacent sizes
        if (!canAlterSize(a.size || '', b.size || '')) continue;
        // Skip duplicate pairs
        const pairKey = [a.id, b.id].sort().join('-');
        if (checked.has(pairKey)) continue;

        const bPresent = itemPresent[b.id];
        if (!bPresent) continue;
        const totalComps = a.products?.total_components || 0;
        if (totalComps === 0) continue;

        const union = new Set([...aPresent, ...bPresent]);
        if (union.size >= totalComps) {
          checked.add(pairKey);
          results.push({
            itemA: a, itemB: b,
            missingA: aMissing,
            missingB: itemMissing[b.id] || [],
            sizeA: a.size, sizeB: b.size,
            category: a.products?.name,
            sku: a.serial_number,
          });
        }
      }
    }
    setIntelResults(results);
    setShowIntel(true);
  };

  const isCompletedView = stage === 'completed';

  const filtered = items.filter((i) => {
    // Pending stage hides completed items; completed stage only shows them
    if (!isCompletedView && i.status === 'completed') return false;
    if (isCompletedView && i.status !== 'completed') return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (catFilter !== 'all' && i.product_id !== catFilter) return false;
    if (locFilter !== 'all' && (i.location || '') !== locFilter) return false;
    if (mpFilter !== 'all' && (i.marketplace || '') !== mpFilter) return false;
    if (tagFilter !== 'all') { const t = itemTags[i.id] || []; if (!t.some((tg: any) => tg?.id === tagFilter)) return false; }
    const searchTerm = globalSearch || search;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const fields = [
        i.products?.name, i.products?.sku, i.batch_number, i.serial_number, i.size,
        i.notes, i.location, i.order_id, i.marketplace, i.ticket_id, i.link, i.status,
        ...(itemTags[i.id] || []).map((t: any) => t?.name),
        ...(itemMissing[i.id] || []),
        ...(itemDamaged[i.id] || []),
      ];
      if (!fields.some(f => (f || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const hasActiveFilters = statusFilter !== 'all' || catFilter !== 'all' || locFilter !== 'all' || mpFilter !== 'all' || tagFilter !== 'all' || search !== '' || globalSearch !== '';
  const clearFilters = () => { setStatusFilter('all'); setCatFilter('all'); setLocFilter('all'); setMpFilter('all'); setTagFilter('all'); setSearch(''); setPage(0); };

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  useEffect(() => { setPage(0); }, [statusFilter, catFilter, locFilter, mpFilter, tagFilter, search, globalSearch, stage]);

  const scrollToPair = (pairId: string) => {
    setHighlightId(pairId);
    const el = document.getElementById('row-' + pairId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightId(null), 2000);
  };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      {/* Stage toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!showExtras && <><div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, border: `1px solid ${T.bd}` }}>
            {(['pending', 'completed'] as const).map(s => (
              <div key={s} onClick={() => { setStage(s); setPage(0); }} style={{ padding: '4px 14px', borderRadius: 4, fontSize: 10, fontWeight: stage === s ? 600 : 400, cursor: 'pointer', background: stage === s ? `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)` : 'transparent', color: stage === s ? '#fff' : T.tx3, transition: 'all .15s', textTransform: 'capitalize' }}>{s}</div>
            ))}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500, color: T.tx3 }}>{filtered.length !== items.filter(i => isCompletedView ? i.status === 'completed' : i.status !== 'completed').length ? `${filtered.length} of ` : ''}{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span></>}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {!showExtras && <div title="Download filtered inventory as CSV" onClick={() => {
            if (filtered.length === 0) return;
            const csv = 'Batch,SKU,Category,Size,Status,Location,Missing,Damaged\n' + filtered.map(i => `${i.batch_number || ''},${i.serial_number || ''},"${i.products?.name || ''}",${i.size || ''},${i.status},${i.location || ''},"${(itemMissing[i.id] || []).join('; ')}","${(itemDamaged[i.id] || []).join('; ')}"`).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Inventory_${stage}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
          }} style={{ ...S.btnGhost, fontSize: 10 }}>Export CSV</div>}
          {!showExtras && !isCompletedView && <div onClick={computeIntel} title="Find cross-size completion possibilities" style={{ ...S.btnGhost, background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', color: T.yl, fontWeight: 600, fontSize: 10 }}>Smart Intel</div>}
          {!showExtras && <div onClick={() => { setShowExtras(true); window.history.pushState({ view: 'extras' }, ''); }} style={{ ...S.btnGhost, background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.15)', color: T.bl, fontWeight: 600, fontSize: 10 }}>Extras</div>}
          {!showExtras && canEdit && !isCompletedView && <div onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' }); setCatSearch(''); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); setShowModal(true); }} style={S.btnPrimary}>+ Add Item</div>}
        </div>
      </div>
      {showExtras ? <InventoryExtras /> : <>
      <div className="filter-bar" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '8px 10px', marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, SKU code, location, notes..." style={{ ...S.fInput, flex: 1, minWidth: 160, padding: '6px 9px' }} />
        <div style={{ width: 1, height: 24, background: T.bd2 }} />
        {!isCompletedView && <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Status</option><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select>}
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Categories</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 100, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Locations</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select>
        <select value={mpFilter} onChange={(e) => setMpFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 110, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Marketplaces</option>{MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}</select>
        {tags.length > 0 && <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 90, padding: '6px 9px', cursor: 'pointer', fontSize: 11 }}><option value="all">All Tags</option>{tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        {hasActiveFilters && <span onClick={clearFilters} style={{ fontSize: 10, color: T.ac, cursor: 'pointer', padding: '3px 8px', border: '1px solid rgba(99,102,241,.2)', borderRadius: 4, background: 'rgba(99,102,241,.06)' }}>Clear filters</span>}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
          <thead><tr>{['Unique ID', 'SKU', 'Category', 'Size', 'Tags', 'Notes', 'Status', 'Issues', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
          <tbody>{paged.map((item) => {
            const missing = itemMissing[item.id] || [];
            const damaged = itemDamaged[item.id] || [];
            return (<tr key={item.id} id={'row-' + item.id} style={{ transition: 'background .2s', background: highlightId === item.id ? 'rgba(99,102,241,.08)' : 'transparent' }} onMouseEnter={e => { if (highlightId !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,.015)'; }} onMouseLeave={e => { if (highlightId !== item.id) e.currentTarget.style.background = 'transparent'; }}>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10, whiteSpace: 'nowrap' }}><span style={{ color: T.gr }}>{item.batch_number || '—'}</span>{isCompletedView && item.paired_with && (() => { const pair = items.find(p => p.id === item.paired_with); return pair ? <span onClick={() => scrollToPair(item.paired_with)} style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, cursor: 'pointer' }} title="Click to find paired item"><svg viewBox="0 0 24 24" style={{ width: 9, height: 9, fill: 'none', stroke: T.ac2, strokeWidth: 2, flexShrink: 0 }}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg><span style={{ fontSize: 9, color: T.ac2 }}>{pair.batch_number}</span></span> : null; })()}</td>
            <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.ac2, fontSize: 10 }}>{item.serial_number || '—'}{item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: T.bl, verticalAlign: 'middle' }}><Icon name="link" size={10} /></a>}</td>
            <td style={{ ...S.tdStyle, fontSize: 11 }}><span style={{ fontWeight: 500 }}>{item.products?.name}</span></td>
            <td style={{ ...S.tdStyle, fontSize: 10, fontWeight: 500 }}>{item.size || '—'}</td>
            <td style={S.tdStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{(itemTags[item.id] || []).map((t: any) => t && <span key={t.id} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(99,102,241,.10)', color: T.ac2 }}>{t.name}</span>)}{(itemTags[item.id] || []).length === 0 && <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}</div></td>
            <td style={{ ...S.tdStyle, fontSize: 11, maxWidth: 140 }}>{item.notes ? <span onClick={() => setExpandedNote(expandedNote === item.id ? null : item.id)} style={{ color: T.tx2, cursor: 'pointer' }}>{expandedNote === item.id ? item.notes : item.notes.length > 25 ? item.notes.slice(0, 25) + '...' : item.notes}</span> : <span style={{ color: T.tx3 }}>—</span>}</td>

            <td style={S.tdStyle}><span style={statusTag(item.status)}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.6 }} />{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></td>
            <td style={S.tdStyle}>{(missing.length > 0 || damaged.length > 0) ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{missing.map((name, i) => <span key={'m'+i} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(251,191,36,.08)', color: T.yl }}>Missing: {name}</span>)}{damaged.map((name, i) => <span key={'d'+i} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 500, background: 'rgba(248,113,113,.08)', color: T.re }}>Damaged: {name}</span>)}</div> : <span style={{ color: T.tx3, fontSize: 10 }}>{item.status === 'completed' || item.status === 'complete' ? 'All good' : '—'}</span>}</td>
            <td style={S.tdStyle}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <span onClick={() => openComps(item)} style={{ ...S.btnPrimary, ...S.btnSm }}>View</span>
                {!isCompletedView && completablePairs[item.id]?.length > 0 && <span onClick={() => setShowCompleteModal({ itemId: item.id })} style={{ ...S.btnSm, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 600, fontFamily: T.sans, background: 'rgba(16,185,129,.12)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' as const }}>Complete ({completablePairs[item.id].length})</span>}
                {isCompletedView && canEdit && <span onClick={() => { if (confirm(item.paired_with ? 'This will revert BOTH paired items back to Inventory. Continue?' : 'Revert this item back to Inventory?')) handleCancelCompletion(item.id); }} style={{ ...S.btnSm, padding: '2px 7px', borderRadius: 4, border: '1px solid rgba(251,191,36,.15)', cursor: 'pointer', fontSize: 9, fontWeight: 600, fontFamily: T.sans, background: 'rgba(251,191,36,.05)', color: T.yl, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' as const }}>Revert{item.paired_with ? ' Both' : ''}</span>}
                {canEdit && <span onClick={() => openEdit(item)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</span>}
                {canEdit && <span onClick={() => handleDelete(item.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Del</span>}
              </div>
            </td>
          </tr>);})}</tbody>
        </table>
        </div>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: T.tx3 }}>{hasActiveFilters ? <><p style={{ fontSize: 12, marginBottom: 4 }}>No items match your filters</p><p style={{ fontSize: 10 }}>Try adjusting filters or click "Clear filters"</p></> : <><p style={{ fontSize: 13, marginBottom: 4 }}>No items yet</p><p style={{ fontSize: 10 }}>Click "+ Add Item" to register your first inventory item</p></>}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ ...S.fInput, width: 'auto', padding: '3px 6px', fontSize: 10, cursor: 'pointer' }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
        <span style={{ color: T.tx3 }}>rows</span>
        {totalPages > 1 && <>
          <span onClick={() => setPage(Math.max(0, page - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</span>
          <span style={{ color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <span onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>Next</span>
        </>}
        {invTruncated && <span onClick={() => { setInvLimit(p => p + 5000); fetchData(); }} style={{ ...S.btnGhost, fontSize: 9, color: T.yl, borderColor: 'rgba(245,158,11,.2)', background: 'rgba(245,158,11,.06)' }}>Load More Items ({invLimit} loaded)</span>}
      </div>

      {showModal && (<div style={S.modalOverlay}><div className="modal-inner" style={S.modalBox}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span></div><form onSubmit={handleSubmit} style={{ padding: 16 }}><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>Category *</label><input value={catSearch} onChange={(e) => { setCatSearch(e.target.value); setShowCatDrop(true); setForm({ ...form, product_id: '' }); }} onFocus={() => setShowCatDrop(true)} placeholder="Type to search categories by name or SKU..." style={{ ...S.fInput, opacity: selected ? 0.6 : 1 }} autoComplete="off" disabled={!!selected} /><input type="hidden" value={form.product_id} required />{form.product_id && <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: T.r, background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', fontSize: 12, color: T.ac2 }}>{products.find(p => p.id === form.product_id)?.name} <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{products.find(p => p.id === form.product_id)?.sku}</span><span onClick={() => { setForm({ ...form, product_id: '' }); setCatSearch(''); }} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6 }}>✕</span></div>}{showCatDrop && !form.product_id && (() => { const q = catSearch.toLowerCase(); const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))); return filtered.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>{filtered.map(p => <div key={p.id} onClick={() => { setForm({ ...form, product_id: p.id }); setCatSearch(p.name); setShowCatDrop(false); supabase.from('components').select('*').eq('product_id', p.id).then(({ data }) => { setCatComps(data || []); setMissingComps(new Set()); setDamagedComps(new Set()); const allDup = (data || []).length > 0 && (data || []).every((c: any) => isDupatta(c.name)); if (allDup) setForm(f => ({ ...f, size: 'N/A' })); }); }} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ fontSize: 13, color: T.tx }}>{p.name}</span><span style={{ fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{p.sku}</span></div>)}</div> : catSearch ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, padding: '12px 14px', fontSize: 12, color: T.tx3, zIndex: 10 }}>No categories found</div> : null; })()}</div><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>SKU Code <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 8 }}>(unique identifier)</span></label><input value={form.serial_number} onChange={(e) => { setForm({ ...form, serial_number: e.target.value }); setShowSkuDrop(true); }} onFocus={() => setShowSkuDrop(true)} onBlur={() => setTimeout(() => setShowSkuDrop(false), 150)} placeholder="e.g. LC-001-A" style={{ ...S.fInput, fontFamily: T.mono }} autoComplete="off" />{showSkuDrop && form.serial_number && (() => { const q = form.serial_number.toLowerCase(); const existing = [...new Set(items.map(i => i.serial_number).filter(Boolean))]; const matches = existing.filter(s => s.toLowerCase().includes(q) && s !== form.serial_number); return matches.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 140, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,.3)' }}>{matches.slice(0, 8).map(s => <div key={s} onMouseDown={() => { setForm({ ...form, serial_number: s }); setShowSkuDrop(false); }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: T.mono, color: T.ac2, borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{s}</div>)}</div> : null; })()}</div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Size <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 8 }}>(N/A for Dupatta · Free Size for Lehenga)</span></label><select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} style={S.fInput}><option value="">Select size...</option>{SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label style={S.fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="complete">Complete</option></select></div></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Location</label><select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} style={S.fInput}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div><div><label style={S.fLabel}>Marketplace</label><select value={form.marketplace} onChange={(e) => setForm({ ...form, marketplace: e.target.value })} style={S.fInput}><option value="">Select</option>{MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div>{(form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') && catComps.length > 0 && <div style={{ marginBottom: 14 }}>
  <label style={S.fLabel}>Component Status <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(click to toggle: Present → Missing → Damaged)</span></label>
  {form.status === 'damaged' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
    <span onClick={() => { setDamagedComps(new Set(catComps.map((c: any) => c.id))); setMissingComps(new Set()); }} style={{ ...S.btnDanger, fontSize: 10, padding: '3px 10px', cursor: 'pointer' }}>Mark All Damaged</span>
    <span onClick={() => { setDamagedComps(new Set()); setMissingComps(new Set()); }} style={{ ...S.btnGhost, fontSize: 10, padding: '3px 10px' }}>Reset All</span>
  </div>}
  <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 8 }}>{catComps.map(c => {
    const isMissing = missingComps.has(c.id);
    const isDamaged = damagedComps.has(c.id);
    const state = isDamaged ? 'damaged' : isMissing ? 'missing' : 'present';
    const cycle = () => {
      const m = new Set(missingComps); const d = new Set(damagedComps);
      if (state === 'present') { m.add(c.id); d.delete(c.id); }
      else if (state === 'missing') { m.delete(c.id); d.add(c.id); }
      else { m.delete(c.id); d.delete(c.id); }
      setMissingComps(m); setDamagedComps(d);
    };
    const bg = isDamaged ? 'rgba(248,113,113,.08)' : isMissing ? 'rgba(251,191,36,.08)' : 'transparent';
    const bdr = isDamaged ? 'rgba(248,113,113,.3)' : isMissing ? 'rgba(251,191,36,.3)' : 'transparent';
    const clr = isDamaged ? T.re : isMissing ? T.yl : T.gr;
    return <div key={c.id} onClick={cycle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3, background: bg, border: `1px solid ${bdr}`, transition: 'all .12s' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: clr, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: state === 'present' ? T.tx : clr, flex: 1 }}>{c.name}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: clr, textTransform: 'uppercase' as const }}>{state}</span>
    </div>;
  })}</div>
  {missingComps.size > 0 && <p style={{ fontSize: 10, color: T.yl, marginTop: 5 }}>{missingComps.size} missing</p>}
  {damagedComps.size > 0 && <p style={{ fontSize: 10, color: T.re, marginTop: 3 }}>{damagedComps.size} damaged</p>}
  {form.status === 'unsorted' && missingComps.size === catComps.length && damagedComps.size === 0 && <p style={{ fontSize: 11, color: T.re, marginTop: 5, background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)', borderRadius: 6, padding: '6px 10px' }}>All missing — change status to "Damaged" or deselect some.</p>}
</div>}<div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Order ID</label><input value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Ticket ID</label><input value={form.ticket_id} onChange={(e) => setForm({ ...form, ticket_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ marginBottom: 12 }}><label style={S.fLabel}>Link</label><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Optional URL" style={S.fInput} /></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Tags <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(comma separated)</span></label><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. urgent, wedding" style={S.fInput} /></div><div><label style={S.fLabel}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ padding: '14px 0 0', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><span onClick={() => setShowModal(false)} style={S.btnGhost}>Cancel</span><button type="submit" style={S.btnPrimary}>{selected ? 'Update' : 'Add'}</button></div></form></div></div>)}

      {showCompModal && selected && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 520 }}><div style={S.modalHead}><div><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected.products?.name}</span><div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{selected.batch_number}</span>{selected.serial_number && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2 }}>{selected.serial_number}</span>}<span style={statusTag(selected.status)}>{selected.status}</span>{selected.batch_number && <span onClick={() => printBarcode(selected.batch_number)} style={{ ...S.btnGhost, ...S.btnSm }}>Print Barcode</span>}</div>{selected.order_id && <p style={{ margin: '3px 0 0', fontSize: 10, color: T.tx3 }}>Order: {selected.order_id}{selected.marketplace ? ` | ${selected.marketplace}` : ''}</p>}{selected.ticket_id && <p style={{ margin: '2px 0 0', fontSize: 10, color: T.tx3 }}>Ticket: {selected.ticket_id}</p>}{selected.link && <a href={selected.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.ac, marginTop: 2, display: 'block' }}>Open Link</a>}</div><span onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Components</p>
        {comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.status === 'missing' ? 'rgba(245,166,35,.2)' : T.bd}`, borderRadius: 6, marginBottom: 5 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><span style={{ fontWeight: 500, fontSize: 11, color: T.tx }}>{c.components?.name}</span>{c.status === 'missing' && <span style={{ fontSize: 9, color: T.yl, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,166,35,.08)' }}>MISSING</span>}</div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 85, padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}
        {comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 11, padding: 14 }}>No components</p>}
        {itemLogs.length > 0 && <><div style={{ borderTop: `1px solid ${T.bd}`, marginTop: 12, paddingTop: 12 }}><p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Activity History</p>{itemLogs.map(log => <div key={log.id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 8, fontSize: 10 }}><span style={{ color: T.tx3, whiteSpace: 'nowrap', fontFamily: T.mono, fontSize: 9 }}>{new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><span style={{ color: T.tx2 }}>{log.description || log.action}</span></div>)}</div></>}
      </div></div></div>)}
      {matchResult && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 480 }}><div style={{ ...S.modalHead, background: 'rgba(45,212,160,.05)', borderBottom: `1px solid rgba(45,212,160,.15)` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.gr }}>Pair Match Found!</span><span onClick={() => setMatchResult(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span></div><div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.18)', borderRadius: T.r, padding: 12, marginBottom: 12, fontSize: 11, color: T.gr }}>
          A complete <strong>{matchResult.categoryName}</strong>{matchResult.size && <> in size <strong>{matchResult.size}</strong></>}{matchResult.sku && <> (SKU: <span style={{ fontFamily: T.mono }}>{matchResult.sku}</span>)</>} can be assembled!
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Current Item</p>
            <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, margin: '0 0 8px' }}>{matchResult.currentUniqueId}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 6px' }}>Has these components:</p>
            {matchResult.currentPresent.map((n: string) => <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gr }} /><span style={{ fontSize: 12, color: T.tx }}>{n}</span></div>)}
          </div>
          <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14 }}>
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Matching Item</p>
            <p style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, margin: '0 0 4px' }}>{matchResult.otherUniqueId}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 8px' }}>Added on {matchResult.otherDate}</p>
            <p style={{ fontSize: 11, color: T.tx3, margin: '0 0 6px' }}>Has these components:</p>
            {matchResult.otherPresent.map((n: string) => <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: T.gr }} /><span style={{ fontSize: 12, color: T.tx }}>{n}</span></div>)}
          </div>
        </div>
        <div style={{ background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.2)', borderRadius: T.r, padding: 12, fontSize: 12, color: T.ac2, textAlign: 'center' }}>
          Combine both items to complete the <strong>{matchResult.categoryName}</strong>
        </div>
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'flex-end' }}><div onClick={() => setMatchResult(null)} style={S.btnPrimary}>Got it</div></div>
      </div></div></div>)}

      {showCompleteModal && (() => {
        const itemA = items.find(i => i.id === showCompleteModal.itemId);
        if (!itemA) return null;
        const missingA = itemMissing[itemA.id] || [];
        const pairIds = completablePairs[itemA.id] || [];
        const pairItems = pairIds.map(pid => items.find(i => i.id === pid)).filter(Boolean);
        const selectedPair = showCompleteModal.pairId ? items.find(i => i.id === showCompleteModal.pairId) : null;

        return (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 540, maxWidth: '100%' }}>
          <div style={{ ...S.modalHead, background: 'rgba(16,185,129,.06)', borderBottom: '1px solid rgba(16,185,129,.2)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>Complete Product</span>
          </div>
          <div style={{ padding: 18 }}>
            {/* Current item */}
            <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600 }}>This Item</span>
                <span style={{ fontSize: 11, fontFamily: T.mono, color: T.gr }}>{itemA.batch_number}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: T.tx, margin: '0 0 4px' }}>{itemA.products?.name} {itemA.serial_number && <span style={{ fontFamily: T.mono, color: T.ac2, fontWeight: 400 }}>({itemA.serial_number})</span>}{itemA.size && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: 10, background: T.s3, color: T.tx2 }}>{itemA.size}</span>}</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {missingA.map(name => <span key={name} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'rgba(251,191,36,.12)', color: T.yl }}>{name} missing</span>)}
              </div>
            </div>

            {/* Pair selection */}
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Select item to combine with ({pairItems.length} available)</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {pairItems.map((b: any) => {
                const missingB = itemMissing[b.id] || [];
                const isSelected = showCompleteModal.pairId === b.id;
                return <div key={b.id} onClick={() => setShowCompleteModal({ ...showCompleteModal, pairId: b.id })} style={{ background: isSelected ? 'rgba(16,185,129,.08)' : T.s2, border: `1px solid ${isSelected ? 'rgba(16,185,129,.4)' : T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 6, cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isSelected ? '#10b981' : T.bd2}`, background: isSelected ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{isSelected && '✓'}</div>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.gr }}>{b.batch_number}</span>
                      {b.serial_number && <span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2 }}>{b.serial_number}</span>}
                      {b.size && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: T.s3, color: T.tx2 }}>{b.size}</span>}
                    </div>
                    {b.location && <span style={{ fontSize: 10, color: T.tx3 }}>{b.location}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 26 }}>
                    {missingB.length > 0
                      ? missingB.map(name => <span key={name} style={{ padding: '1px 6px', borderRadius: 8, fontSize: 9, background: 'rgba(251,191,36,.1)', color: T.yl }}>{name} missing</span>)
                      : <span style={{ fontSize: 10, color: T.gr }}>All components present</span>
                    }
                  </div>
                  {isSelected && <div style={{ marginLeft: 26, marginTop: 6, fontSize: 11, color: '#10b981' }}>Combined = <strong>Complete {itemA.products?.name}</strong></div>}
                </div>;
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span onClick={() => setShowCompleteModal(null)} style={S.btnGhost}>Cancel</span>
              <span onClick={() => { if (showCompleteModal.pairId) handleComplete(showCompleteModal.itemId, showCompleteModal.pairId); else addToast('Select an item to combine with', 'error'); }} style={{ ...S.btnPrimary, background: selectedPair ? 'linear-gradient(135deg, #10b981, #34d399)' : T.bd2, boxShadow: selectedPair ? '0 2px 8px rgba(16,185,129,.25)' : 'none', opacity: selectedPair ? 1 : 0.5 }}>Mark as Completed</span>
            </div>
          </div>
        </div></div>);
      })()}

      {pendingDelete && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 280 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>Item deleted</span>
          <span onClick={undoDelete} style={{ ...S.btnPrimary, padding: '4px 12px', fontSize: 11, background: T.yl, color: '#000', boxShadow: 'none' }}>Undo</span>
          <span onClick={() => { clearTimeout(pendingDelete.timer); setPendingDelete(null); const id = pendingDelete.id; supabase.from('item_tags').delete().eq('inventory_item_id', id).then(() => supabase.from('item_components').delete().eq('inventory_item_id', id)).then(() => supabase.from('inventory_items').delete().eq('id', id)).then(() => fetchData()); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14 }}>✕</span>
        </div>
        <div className="undo-bar" key={pendingDelete.id} />
      </div>}

      {/* Smart Intel Modal */}
      {showIntel && (<div style={S.modalOverlay}><div className="modal-inner" style={{ ...S.modalBox, width: 580, maxWidth: '100%' }}>
        <div style={{ ...S.modalHead, background: 'rgba(251,191,36,.06)', borderBottom: '1px solid rgba(251,191,36,.2)' }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.yl }}>Smart Intel</span>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>Cross-size completion possibilities (adjacent size alteration)</p>
          </div>
          <span onClick={() => setShowIntel(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>✕</span>
        </div>
        <div style={{ padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {intelResults.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: T.tx3 }}>
            <p style={{ fontSize: 14, marginBottom: 6 }}>No cross-size matches found</p>
            <p style={{ fontSize: 11 }}>Intel looks for unsorted items with the same SKU but adjacent sizes (e.g. M ↔ L) that can complete each other</p>
          </div>}
          {intelResults.map((r, idx) => (
            <div key={idx} style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{r.category}</span>
                  {r.sku && <span style={{ marginLeft: 6, fontFamily: T.mono, fontSize: 11, color: T.ac2 }}>{r.sku}</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.yl, background: 'rgba(251,191,36,.1)', padding: '2px 8px', borderRadius: 4 }}>{r.sizeA} ↔ {r.sizeB}</span>
              </div>
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemA.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,.1)', color: T.yl }}>{r.sizeA}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingA.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'rgba(251,191,36,.1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemB.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(251,191,36,.1)', color: T.yl }}>{r.sizeB}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingB.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'rgba(251,191,36,.1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ background: 'rgba(251,191,36,.05)', border: '1px solid rgba(251,191,36,.15)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.yl, display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.yl, strokeWidth: 2, flexShrink: 0 }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                Can complete by altering size {r.sizeA} → {r.sizeB} or {r.sizeB} → {r.sizeA}
                {r.missingA.some((n: string) => isDupatta(n)) || r.missingB.some((n: string) => isDupatta(n)) ? ' (Dupatta is universal - no alteration needed)' : ''}
              </div>
            </div>
          ))}
          {intelResults.length > 0 && <p style={{ fontSize: 10, color: T.tx3, textAlign: 'center', marginTop: 8 }}>
            Size alteration: XS↔S, S↔M, M↔L, L↔XL, XL↔XXL | Semi-Stitched matches all | Dupatta has no size
          </p>}
        </div>
      </div></div>)}
      </>}
    </div>
  );
}



