// Inventory page — CRUD, pair completion, smart intel, extras integration
import React, { useState, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { supabase } from '../lib/supabase';
import { T, S, Icon } from '../lib/theme';
import SwipeRow from '../components/ui/SwipeRow';
import { friendlyError } from '../lib/friendlyError';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { printOrQueue } from '../lib/printQueue';
import { useBreadcrumb } from '../hooks/useBreadcrumb';
import InventoryExtras from './InventoryExtras';
import Empty from '../components/ui/Empty';
import { SkeletonRows } from '../components/ui/Skeleton';
import ConfirmModal, { useConfirm } from '../components/ui/ConfirmModal';

// Status indicator — dot + plain label. Previous pills-with-bg were noisy in the
// list view per audit P2; reserve pill treatment for modals.
const STATUS_DOT_COLOR: Record<string, string> = {
  completed: T.gr,
  complete: T.gr,
  damaged: T.re,
  unsorted: T.yl,
  dry_clean: T.bl,
};
const statusTag = (status: string) => ({
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 6,
  padding: '2px 0',
  fontSize: 11,
  fontWeight: 500,
  color: STATUS_DOT_COLOR[status] || STATUS_DOT_COLOR.unsorted,
});


const MARKETPLACES = ['Myntra-Fusionic', 'Ajio-Fusionic', 'Tanuka', 'Svaraa', 'Amazon'];
const SIZES = ['N/A', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'Semi-Stitched'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const canAlterSize = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a === 'Semi-Stitched' || b === 'Semi-Stitched') return true;
  if (a === 'N/A' || b === 'N/A') return true;
  const ai = SIZE_ORDER.indexOf(a), bi = SIZE_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return false;
  return Math.abs(ai - bi) === 1;
};
import { isDupatta, isLehenga, isBottomType, mfrFromSku } from '../lib/garmentHelpers';

export default function Inventory({ openItemId, onItemOpened, active }: { openItemId?: string | null; onItemOpened?: () => void; active?: boolean }) {
  const [stage, setStage] = useState<'pending' | 'completed'>('pending');
  const instanceId = useId();
  const { ask, modalProps: confirmModalProps } = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showCompModal, setShowCompModal] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [itemTags, setItemTags] = useState<Record<string, any[]>>({});
  // Multi-select filters (Claude-design feedback): each field holds an array of selected values.
  // Empty array = no filter on that field.
  const [filters, setFilters] = useState<{ status: string[]; category: string[]; location: string[]; marketplace: string[]; manufacturer: string[]; tag: string[] }>({
    status: [], category: [], location: [], marketplace: [], manufacturer: [], tag: [],
  });
  const [preset, setPreset] = useState<string>('all');
  const [showFiltersPopover, setShowFiltersPopover] = useState(false);
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  // Bulk selection (audit P1: docked action bar)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const { profile } = useAuth();
  const { addToast } = useNotifications();
  const emptyForm = { product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', manufacturer: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' };
  const [form, setForm] = useState(emptyForm);
  const resetForm = () => { setShowModal(false); setSelected(null); setForm(emptyForm); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); setShowCatDrop(false); setShowSkuDrop(false); setShowMoreFields(false); };
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
  const [itemDamagedIds, setItemDamagedIds] = useState<Record<string, Set<string>>>({});
  const [itemPresent, setItemPresent] = useState<Record<string, Set<string>>>({});
  const [completablePairs, setCompletablePairs] = useState<Record<string, string[]>>({});
  const [showCompleteModal, setShowCompleteModal] = useState<{ itemId: string; pairId?: string } | null>(null);
  const [showIntel, setShowIntel] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [quickStatusItem, setQuickStatusItem] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const [intelResults, setIntelResults] = useState<any[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [exportPdfHtml, setExportPdfHtml] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (!showMore) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMore(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMore]);
  const [saving, setSaving] = useState(false);
  const [invLimit, setInvLimit] = useState(5000);
  const [invTruncated, setInvTruncated] = useState(false);

  useEffect(() => {
    const hasModal = showModal || showCompModal || !!matchResult || !!showCompleteModal || showIntel || !!exportPdfHtml;
    document.body.classList.toggle('modal-open', hasModal);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showModal, showCompModal, matchResult, showCompleteModal, showIntel, exportPdfHtml]);

  useEffect(() => { if (active) setShowExtras(false); }, [active]);

  const { set: setBreadcrumb } = useBreadcrumb();
  useEffect(() => {
    if (showExtras) setBreadcrumb(['Spare Parts']);
    else setBreadcrumb(null);
    return () => setBreadcrumb(null);
  }, [showExtras, setBreadcrumb]);

  const fetchData = () => {
    setLoading(true);
    const p1 = supabase.from('inventory_items').select('id, batch_number, serial_number, product_id, size, status, location, manufacturer, notes, order_id, marketplace, ticket_id, link, status_changed_at, created_at, updated_at, products(name, sku, total_components)').order('created_at', { ascending: false }).limit(invLimit).then(({ data, error }) => { if (error) addToast('Failed to load inventory — ' + friendlyError(error), 'error'); setItems(data || []); setInvTruncated((data || []).length >= invLimit); });
    supabase.from('products').select('id, name, sku, total_components, category').eq('is_active', true).then(({ data, error }) => { if (error) addToast('Failed to load categories — ' + friendlyError(error), 'error'); setProducts(data || []); });
    supabase.from('locations').select('id, name').order('name').then(({ data, error }) => { if (error) addToast('Failed to load locations — ' + friendlyError(error), 'error'); setLocations(data || []); });
    supabase.from('tags').select('id, name, color').order('name').then(({ data, error }) => { if (error) addToast('Failed to load tags — ' + friendlyError(error), 'error'); setTags(data || []); });
    supabase.from('inventory_items').select('manufacturer').gt('manufacturer', '').limit(5000).then(({ data, error }) => { if (error) { addToast('Failed to load manufacturers — ' + friendlyError(error), 'error'); return; } const unique = [...new Set((data || []).map(d => d.manufacturer).filter(Boolean))].sort(); setManufacturers(unique); });
    supabase.from('item_tags').select('inventory_item_id, tag_id, tags(id, name, color)').limit(5000).then(({ data, error }) => {
      if (error) { addToast('Failed to load tags — ' + friendlyError(error), 'error'); return; }
      const map: Record<string, { id: string; name: string; color: string }[]> = {};
      (data || []).forEach((it) => { if (!map[it.inventory_item_id]) map[it.inventory_item_id] = []; map[it.inventory_item_id].push(it.tags as unknown as { id: string; name: string; color: string }); });
      setItemTags(map);
    });
    const p2 = supabase.from('item_components').select('inventory_item_id, component_id, status, components(name)').limit(5000).then(({ data, error }) => {
      if (error) { addToast('Failed to load components — ' + friendlyError(error), 'error'); return; }
      const missingMap: Record<string, string[]> = {};
      const damagedMap: Record<string, string[]> = {};
      const damagedIdMap: Record<string, Set<string>> = {};
      const presentMap: Record<string, Set<string>> = {};
      (data || []).forEach((ic) => {
        const comp = ic.components as unknown as { name: string } | null;
        if (ic.status === 'missing') {
          if (!missingMap[ic.inventory_item_id]) missingMap[ic.inventory_item_id] = [];
          if (comp?.name) missingMap[ic.inventory_item_id].push(comp.name);
        }
        if (ic.status === 'damaged') {
          if (!damagedMap[ic.inventory_item_id]) damagedMap[ic.inventory_item_id] = [];
          if (comp?.name) damagedMap[ic.inventory_item_id].push(comp.name);
          if (!damagedIdMap[ic.inventory_item_id]) damagedIdMap[ic.inventory_item_id] = new Set();
          damagedIdMap[ic.inventory_item_id].add(ic.component_id);
        }
        if (ic.status === 'present') {
          if (!presentMap[ic.inventory_item_id]) presentMap[ic.inventory_item_id] = new Set();
          presentMap[ic.inventory_item_id].add(ic.component_id);
        }
      });
      setItemMissing(missingMap); setItemDamaged(damagedMap); setItemDamagedIds(damagedIdMap);
      setItemPresent(presentMap);
    });
    Promise.all([p1, p2]).then(() => setLoading(false)).catch(() => setLoading(false));
  };

  // Compute all completable pairs: must match category + SKU + size
  useEffect(() => {
    if (items.length === 0 || Object.keys(itemPresent).length === 0) return;
    const compute = () => {
      const unsorted = items.filter(i => i.status === 'unsorted');
      if (unsorted.length > 300) { setCompletablePairs({}); return; }
      const pairs: Record<string, string[]> = {};
      for (const a of unsorted) {
        const aPresent = itemPresent[a.id];
        const aMissing = itemMissing[a.id];
        if (!aMissing || aMissing.length === 0 || !aPresent) continue;
        const totalComps = a.products?.total_components || 0;
        if (totalComps === 0) continue;
        for (const b of unsorted) {
          if (a.id === b.id) continue;
          if (a.product_id !== b.product_id) continue;
          if ((a.serial_number || '') !== (b.serial_number || '')) continue;
          const sA = a.size || 'N/A', sB = b.size || 'N/A';
          if (sA !== sB && sA !== 'N/A' && sB !== 'N/A') continue;
          const bPresent = itemPresent[b.id];
          if (!bPresent) continue;
          const union = new Set([...aPresent, ...bPresent]);
          if (union.size >= totalComps) {
            const aDmg = itemDamagedIds[a.id] || new Set();
            const bDmg = itemDamagedIds[b.id] || new Set();
            const hasUnresolvedDamage = [...aDmg, ...bDmg].some(id => !aPresent.has(id) && !bPresent.has(id));
            if (hasUnresolvedDamage) continue;
            if (!pairs[a.id]) pairs[a.id] = [];
            if (!pairs[a.id].includes(b.id)) pairs[a.id].push(b.id);
          }
        }
      }
      setCompletablePairs(pairs);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(compute);
    else setTimeout(compute, 100);
  }, [items, itemMissing, itemPresent, itemDamagedIds]);
  useEffect(() => {
    fetchData();
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedFetch = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fetchData, 500); };
    const immFetch = () => fetchData();
    const ch = supabase.channel('inv-sync-' + instanceId.replace(/:/g, ''))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_items' }, immFetch)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventory_items' }, immFetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory_items' }, debouncedFetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'item_components' }, immFetch)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'item_components' }, immFetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'item_components' }, debouncedFetch)
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
    let mounted = true;
    (async () => {
      const { data: item, error: itemErr } = await supabase.from('inventory_items').select('*, products(name, sku, total_components)').eq('id', openItemId).maybeSingle();
      if (!mounted) return;
      if (itemErr) { addToast(friendlyError(itemErr), 'error'); onItemOpened?.(); return; }
      if (item) { setSelected(item); await fetchComps(item.id); if (!mounted) return; const { data: logs, error: logsErr } = await supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20); if (!mounted) return; if (logsErr) addToast(friendlyError(logsErr), 'error'); setItemLogs(logs || []); setShowCompModal(true); }
      onItemOpened?.();
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  const fetchComps = async (id: string) => { const { data, error } = await supabase.from('item_components').select('*, components(name, component_code, is_critical)').eq('inventory_item_id', id); if (error) { addToast(friendlyError(error), 'error'); return; } setComps(data || []); };

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
    const { data: itemComps } = await supabase.from('item_components').select('id, component_id').eq('inventory_item_id', inventoryItemId);
    if (!itemComps || itemComps.length === 0) return;
    const byStatus: Record<string, string[]> = { damaged: [], missing: [], present: [] };
    for (const ic of itemComps) {
      const status = damagedComps.has(ic.component_id) ? 'damaged' : missingComps.has(ic.component_id) ? 'missing' : 'present';
      byStatus[status].push(ic.id);
    }
    await Promise.all(Object.entries(byStatus).filter(([, ids]) => ids.length > 0).map(([status, ids]) =>
      supabase.from('item_components').update({ status }).in('id', ids)
    ));
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
    if (!form.serial_number.trim()) { addToast('SKU is required', 'error'); return; }
    if (!form.location) { addToast('Location is required', 'error'); return; }
    if (!form.manufacturer.trim()) { addToast('Manufacturer is required', 'error'); return; }
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
    if (form.size === 'Semi-Stitched' && !catComps.some(c => isLehenga(c.name))) {
      addToast('Semi-Stitched is only allowed for Lehenga', 'error'); return;
    }
    if (catComps.some(c => isBottomType(c.name)) && (form.size === 'N/A' || form.size === 'Semi-Stitched')) {
      addToast('Bottom/Pant requires a specific size (not N/A or Semi-Stitched)', 'error'); return;
    }
    if (!selected && form.status === 'unsorted' && catComps.length > 0 && missingComps.size === 0 && damagedComps.size === 0) {
      addToast('All components are present — status should be "Complete" not "Unsorted"', 'error'); return;
    }
    if (form.status === 'unsorted' && catComps.length > 0 && missingComps.size === catComps.length) {
      addToast('All components are missing — entire product is missing. Change status or deselect some.', 'error'); return;
    }
    setSaving(true);
    let savedItemId = '';
    try {
    if (selected) {
      if (selected.serial_number && selected.serial_number !== form.serial_number) {
        const { count, error: cntErr } = await supabase.from('inventory_extras').select('id', { count: 'exact', head: true }).eq('sku', selected.serial_number);
        if (cntErr) { addToast('Failed to check spare parts — ' + friendlyError(cntErr), 'error'); return; }
        if ((count || 0) > 0) { addToast(`Cannot change SKU — ${count} extra(s) reference "${selected.serial_number}". Update extras first.`, 'error'); return; }
      }
      const { error } = await supabase.from('inventory_items').update(form).eq('id', selected.id);
      if (error) { addToast(friendlyError(error), 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') {
        await updateComponentStatuses(selected.id);
      } else if (form.status === 'completed') {
        // Marking item complete = all components are present. Otherwise the item
        // shows as completed while still flagging "Missing: X" — contradiction.
        const { error: cErr } = await supabase.from('item_components').update({ status: 'present' }).eq('inventory_item_id', selected.id);
        if (cErr) addToast('Status saved but component reset failed: ' + friendlyError(cErr), 'error');
      }
      savedItemId = selected.id;
      addToast('Updated!', 'success');
    } else {
      // Auto-generate unique ID and store in batch_number
      const uniqueId = generateUniqueId();
      const insertData = { ...form, batch_number: uniqueId, reported_by: profile?.id };
      const { data, error } = await supabase.from('inventory_items').insert(insertData).select().single();
      if (error || !data) { addToast(error ? friendlyError(error) : 'Save failed', 'error'); return; }
      if (form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') await updateComponentStatuses(data.id);
      savedItemId = data.id;
      if (missingComps.size > 0) {
        const names = catComps.filter(c => missingComps.has(c.id)).map(c => c.name).join(', ');
        addToast(`Added with ${missingComps.size} missing (${names}) — stays Unsorted until complete`, 'success');
      } else {
        addToast(`Item added! ID: ${uniqueId}`, 'success');
      }
    }
    // Save tags
    if (savedItemId && tagInput.trim()) {
      const { error: delTagErr } = await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
      if (delTagErr) { addToast('Tag update failed — ' + friendlyError(delTagErr), 'error'); }
      const tagNames = !delTagErr ? tagInput.split(',').map(t => t.trim()).filter(Boolean) : [];
      for (const name of tagNames) {
        let { data: existing } = await supabase.from('tags').select('id').eq('name', name).maybeSingle();
        if (!existing) {
          const { data: created, error: createErr } = await supabase.from('tags').insert({ name }).select('id').single();
          if (createErr) { addToast(`Tag "${name}" failed — ${friendlyError(createErr)}`, 'error'); continue; }
          existing = created;
        }
        if (existing) {
          const { error: linkErr } = await supabase.from('item_tags').insert({ inventory_item_id: savedItemId, tag_id: existing.id });
          if (linkErr) addToast(`Tag "${name}" link failed — ${friendlyError(linkErr)}`, 'error');
        }
      }
    } else if (savedItemId && !tagInput.trim()) {
      const { error: delTagErr } = await supabase.from('item_tags').delete().eq('inventory_item_id', savedItemId);
      if (delTagErr) addToast('Tag clear warning — ' + friendlyError(delTagErr), 'error');
    }

    const savedProductId = form.product_id;
    const savedStatus = form.status;
    const hadMissing = missingComps.size > 0;
    resetForm(); fetchData();

    // Check for pair matches after save (only for unsorted items with missing components)
    if (savedStatus === 'unsorted' && hadMissing) {
      setTimeout(() => checkForPairMatch(savedProductId, savedItemId), 1000);
    }
    } finally { setSaving(false); }
  };

  const updateComp = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('item_components').update({ status: newStatus }).eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Updated!', 'success');
    await fetchComps(selected.id);
    if (newStatus === 'present' && selected.status === 'unsorted') {
      const { data: allComps } = await supabase.from('item_components').select('status').eq('inventory_item_id', selected.id);
      if (allComps && allComps.length > 0 && allComps.every(c => c.status === 'present')) {
        if (await ask({ title: 'All components present!', message: `Mark this item as Completed?`, confirmLabel: 'Mark Completed' })) {
          const { error: upErr } = await supabase.from('inventory_items').update({ status: 'completed' }).eq('id', selected.id);
          if (upErr) addToast(friendlyError(upErr), 'error');
          else addToast('Marked as completed', 'success');
        }
      }
    }
    fetchData();
  };

  const openEdit = async (item: any) => {
    setSelected(item); setForm({ product_id: item.product_id, serial_number: item.serial_number || '', size: item.size || '', status: item.status, location: item.location || '', manufacturer: item.manufacturer || '', notes: item.notes || '', order_id: item.order_id || '', marketplace: item.marketplace || '', ticket_id: item.ticket_id || '', link: item.link || '' }); setCatSearch(item.products?.name || '');
    const { data: cc } = await supabase.from('components').select('id, name').eq('product_id', item.product_id);
    setCatComps(cc || []);
    const { data: ic } = await supabase.from('item_components').select('component_id, status').eq('inventory_item_id', item.id);
    const missing = new Set<string>(); const damaged = new Set<string>();
    if (ic) ic.forEach((c: any) => { if (c.status === 'missing') missing.add(c.component_id); if (c.status === 'damaged') damaged.add(c.component_id); });
    setMissingComps(missing); setDamagedComps(damaged);
    setTagInput((itemTags[item.id] || []).map((t: any) => t?.name).filter(Boolean).join(', '));
    setShowModal(true);
  };
  const [itemLogs, setItemLogs] = useState<any[]>([]);

  const exportPdf = () => {
    if (filtered.length === 0) return;
    const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
    const rows = filtered.map(i => { const m = (itemMissing[i.id] || []).join(', '); const d = (itemDamaged[i.id] || []).join(', '); const issues = [m ? `Missing: ${m}` : '', d ? `Damaged: ${d}` : ''].filter(Boolean).join(' | '); return `<tr><td>${esc(i.serial_number || '—')}</td><td>${esc(i.products?.name || '—')}</td><td>${esc(i.size || '—')}</td><td>${esc(i.location || '—')}</td><td>${esc(i.manufacturer || '—')}</td><td style="text-transform:capitalize">${esc(i.status === 'dry_clean' ? 'Dry Clean' : i.status)}</td><td style="font-size:9px;color:${m ? '#F59E0B' : d ? '#EF4444' : '#4A5568'}">${esc(issues || '—')}</td></tr>`; }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inventory Report</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#060810;color:#E2E8F0;padding:16px;padding-bottom:80px;-webkit-text-size-adjust:100%}
      .header{margin-bottom:16px}
      .brand{display:flex;align-items:center;gap:10px;margin-bottom:10px}
      .logo{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#6366F1,#38BDF8);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff}
      .title{font-size:15px;font-weight:700;letter-spacing:-0.3px}
      .sub{font-size:10px;color:#6B7890;letter-spacing:0.5px}
      .meta{display:flex;gap:12px;font-size:10px;color:#8896B0;margin-top:8px}
      .meta span{padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
      table{width:100%;border-collapse:collapse;margin-top:4px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.06)}
      th{background:rgba(255,255,255,.03);font-size:9px;font-weight:600;color:#6B7890;text-transform:uppercase;letter-spacing:0.8px;padding:10px 10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06)}
      td{padding:9px 10px;font-size:11px;color:#8896B0;border-bottom:1px solid rgba(255,255,255,.04)}
      tr:nth-child(even) td{background:rgba(255,255,255,.015)}
      .footer{text-align:center;font-size:8px;color:#4A5568;margin-top:16px;letter-spacing:1px;text-transform:uppercase}
      .no-print{display:none}
      @page{size:A4 landscape;margin:8mm}
      @media print{body{background:#fff;color:#222;padding:8mm}.no-print{display:none!important}th{background:#f5f5f5;color:#333}td{color:#444;border-color:#eee}.footer{color:#999}.brand .logo{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>
    <div class="header">
      <div class="brand"><div class="logo">D</div><div><div class="title">Inventory Report</div><div class="sub">Arya Designs</div></div></div>
      <div class="meta"><span>${filtered.length} items</span><span>${isCompletedView ? 'Completed' : 'Active'}</span><span>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
    </div>
    <table><thead><tr><th>SKU</th><th>Category</th><th>Size</th><th>Location</th><th>Manufacturer</th><th>Status</th><th>Issues</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Powered by DailyOffice</div>
    </body></html>`;
    setExportPdfHtml(html);
  };

  const printBarcode = async (uniqueId: string) => {
    const canvas = document.createElement('canvas');
    try { JsBarcode(canvas, uniqueId, { format: 'CODE128', width: 2, height: 60, displayValue: true, fontSize: 14, font: 'IBM Plex Mono', margin: 10 }); } catch { return; }
    const html = `<html><head><title>${uniqueId}</title><style>body{font-family:'IBM Plex Sans',sans-serif;text-align:center;padding:20px}@media print{@page{margin:10mm}}</style></head><body><img src="${canvas.toDataURL()}" /></body></html>`;
    await printOrQueue('label_small', html, { width: 1.97, height: 2.97 }, `Barcode ${uniqueId}`, undefined, addToast);
  };
  const openComps = async (item: any) => {
    setSelected(item); await fetchComps(item.id);
    supabase.from('activity_logs').select('*, profiles:user_id(full_name)').eq('entity_id', item.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setItemLogs(data || []));
    setShowCompModal(true);
  };
  const canEdit = profile && ['admin', 'manager', 'operator'].includes(profile.role);

  const [pendingDelete, setPendingDelete] = useState<{ id: string; timer: number; snapshot: any } | null>(null);
  const deleteTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); }, []);

  const quickStatusChange = async (itemId: string, newStatus: string) => {
    if (newStatus === 'completed') {
      const missing = itemMissing[itemId];
      const damaged = itemDamaged[itemId];
      if ((missing && missing.length > 0) || (damaged && damaged.length > 0)) {
        const issues = [...(missing || []).map(n => `${n} missing`), ...(damaged || []).map(n => `${n} damaged`)];
        addToast(`Cannot complete — ${issues.join(', ')}`, 'error');
        setQuickStatusItem(null);
        return;
      }
    }
    const { error } = await supabase.from('inventory_items').update({ status: newStatus, status_changed_at: new Date().toISOString() }).eq('id', itemId);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast(`Status → ${newStatus}`, 'success'); fetchData(); }
    setQuickStatusItem(null);
  };

  const handleDelete = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    if (item.paired_with) { addToast('Cannot delete — item is part of a completed pair. Revert the pair (Completed tab → Revert), then delete.', 'error'); return; }
    if (item.status === 'completed') { addToast('Cannot delete a completed item. Revert it to Inventory first (Completed tab → Revert).', 'error'); return; }
    const snapshot = item;
    setItems(prev => prev.filter(i => i.id !== itemId));
    const timer = window.setTimeout(async () => {
      deleteTimerRef.current = null;
      const { error } = await supabase.rpc('delete_inventory_item_cascade', { p_item_id: itemId });
      if (error) { addToast('Delete failed — ' + friendlyError(error), 'error'); setItems(prev => [snapshot, ...prev]); }
      setPendingDelete(null);
    }, 5000);
    deleteTimerRef.current = timer;
    setPendingDelete({ id: itemId, timer, snapshot });
  };

  const undoDelete = () => {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer);
      deleteTimerRef.current = null;
      setItems(prev => [pendingDelete.snapshot, ...prev]);
      setPendingDelete(null);
    }
  };

  const handleComplete = async (itemId: string, pairId: string) => {
    if (completing) return;
    setCompleting(true);
    try {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', itemId),
      supabase.from('item_components').select('component_id, status').eq('inventory_item_id', pairId),
      supabase.from('inventory_items').select('product_id, products(total_components)').eq('id', itemId).maybeSingle(),
    ]);
    if (r1.error || r2.error || r3.error) { addToast('Failed to load component data — ' + friendlyError(r1.error || r2.error || r3.error), 'error'); setShowCompleteModal(null); return; }
    const aComps = r1.data; const bComps = r2.data; const prod = r3.data;
    const aP = new Set((aComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const bP = new Set((bComps || []).filter(c => c.status === 'present').map(c => c.component_id));
    const union = new Set([...aP, ...bP]);
    const aDamaged = (aComps || []).filter(c => c.status === 'damaged').map(c => c.component_id);
    const bDamaged = (bComps || []).filter(c => c.status === 'damaged').map(c => c.component_id);
    const unresolvedDamage = [...aDamaged, ...bDamaged].filter(id => !aP.has(id) && !bP.has(id));
    if (unresolvedDamage.length > 0) { addToast('Cannot complete — some components are damaged with no undamaged replacement in either item.', 'error'); setShowCompleteModal(null); fetchData(); return; }
    type ProdJoin = { product_id: string; products: { total_components: number } | { total_components: number }[] | null };
    const prodRow = prod as ProdJoin | null;
    const prodProducts = prodRow?.products;
    const total = Array.isArray(prodProducts) ? (prodProducts[0]?.total_components ?? 0) : (prodProducts?.total_components ?? 0);
    if (total > 0 && union.size < total) { addToast('Cannot complete — combined components do not cover all required parts. Data may have changed.', 'error'); setShowCompleteModal(null); fetchData(); return; }
    const { error } = await supabase.rpc('complete_inventory_pair', { p_a: itemId, p_b: pairId });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setItems(prev => prev.map(i => (i.id === itemId || i.id === pairId) ? { ...i, status: 'completed' } : i));
    addToast('Both items moved to Completed!', 'success');
    setShowCompleteModal(null);
    fetchData();
    } finally { setCompleting(false); }
  };

  const handleCancelCompletion = async (itemId: string) => {
    if (revertingId) return;
    setRevertingId(itemId);
    try {
    // Completed via a spare part? Use the dedicated RPC that also returns the
    // spare to stock and un-fills the component — atomically.
    const { count: extraUsed } = await supabase.from('inventory_extras_history').select('id', { count: 'exact', head: true }).eq('related_inventory_item_id', itemId).eq('action', 'used');
    if ((extraUsed || 0) > 0) {
      const { error } = await supabase.rpc('revert_item_with_extra', { p_item_id: itemId });
      if (error) { addToast(friendlyError(error), 'error'); return; }
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'unsorted' } : i));
      addToast('Item moved back to Inventory — spare part returned to stock', 'success');
      fetchData();
      return;
    }
    const item = items.find(i => i.id === itemId);
    const pairedId = item?.paired_with;
    const { error } = await supabase.rpc('revert_inventory_pair', { p_a: itemId, p_b: pairedId || null });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    const idsToRevert = pairedId ? [itemId, pairedId] : [itemId];
    setItems(prev => prev.map(i => idsToRevert.includes(i.id) ? { ...i, status: 'unsorted', paired_with: null } : i));
    addToast(pairedId ? 'Both paired items moved back to Inventory' : 'Item moved back to Inventory', 'success');
    fetchData();
    } finally { setRevertingId(null); }
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
    if (!isCompletedView && (i.status === 'completed' || i.status === 'complete')) return false;
    if (isCompletedView && i.status !== 'completed' && i.status !== 'complete') return false;
    if (filters.status.length > 0 && !filters.status.includes(i.status)) return false;
    if (filters.category.length > 0 && !filters.category.includes(i.product_id)) return false;
    if (filters.location.length > 0 && !filters.location.includes(i.location || '')) return false;
    if (filters.marketplace.length > 0 && !filters.marketplace.includes(i.marketplace || '')) return false;
    if (filters.manufacturer.length > 0 && !filters.manufacturer.includes(i.manufacturer || '')) return false;
    if (filters.tag.length > 0) { const t = itemTags[i.id] || []; if (!t.some((tg: any) => filters.tag.includes(tg?.id))) return false; }
    const searchTerm = search;
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

  const activeFilterCount = filters.status.length + filters.category.length + filters.location.length + filters.marketplace.length + filters.manufacturer.length + filters.tag.length;
  const hasActiveFilters = activeFilterCount > 0 || search !== '';
  const clearFilters = () => { setFilters({ status: [], category: [], location: [], marketplace: [], manufacturer: [], tag: [] }); setPreset('all'); setSearch(''); setPage(0); };
  const toggleFilterVal = (field: keyof typeof filters, v: string) => {
    setPreset('custom');
    setFilters(f => ({ ...f, [field]: f[field].includes(v) ? f[field].filter(x => x !== v) : [...f[field], v] }));
  };
  const removeChip = (field: keyof typeof filters, v: string) => setFilters(f => ({ ...f, [field]: f[field].filter(x => x !== v) }));
  const PRESETS: { id: string; label: string; filters: Partial<typeof filters> }[] = [
    { id: 'all', label: 'All items', filters: {} },
    { id: 'unsorted', label: 'Unsorted', filters: { status: ['unsorted'] } },
    { id: 'damaged', label: 'Damaged', filters: { status: ['damaged'] } },
    { id: 'dryclean', label: 'In dry clean', filters: { status: ['dry_clean'] } },
  ];
  const applyPreset = (p: typeof PRESETS[number]) => {
    setPreset(p.id);
    setFilters({ status: [], category: [], location: [], marketplace: [], manufacturer: [], tag: [], ...p.filters });
  };

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  useEffect(() => { setPage(0); }, [filters, search, stage]);

  const scrollToPair = (pairId: string) => {
    setHighlightId(pairId);
    const el = document.getElementById('row-' + pairId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightId(null), 2000);
  };

  return (
    <div className="page-pad" style={{ padding: '14px 16px', animation: 'fi .15s ease' }}>
      {/* Stage toggle + subtitle (Brand Tags aesthetic) */}
      <div className="inv-top-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!showExtras && <div className="inv-stage-toggle" style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderRadius: 6, padding: 2, border: `1px solid ${T.bd}`, width: 'fit-content' }}>
            {(['pending', 'completed'] as const).map(s => (
              <button key={s} onClick={() => { setStage(s); setPage(0); }} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: stage === s ? 600 : 400, cursor: 'pointer', background: stage === s ? `linear-gradient(135deg, ${T.ac87}, ${T.ac2cc})` : 'transparent', color: stage === s ? '#fff' : T.tx3, transition: 'all .15s', border: 'none', fontFamily: T.sans }}>{{ pending: 'Active', completed: 'Completed' }[s]}</button>
            ))}
          </div>}
          {!showExtras && <div style={{ fontSize: 12, color: T.tx3 }}>{filtered.length !== items.filter(i => isCompletedView ? i.status === 'completed' : i.status !== 'completed').length ? `${filtered.length} of ` : ''}{filtered.length} item{filtered.length === 1 ? '' : 's'} · {isCompletedView ? 'completed batches' : 'active SKUs by status'}</div>}
        </div>
        <div className="inv-action-btns" style={{ display: 'flex', gap: 5 }}>
          {!showExtras && canEdit && !isCompletedView && <button onClick={() => { resetForm(); setShowModal(true); }} style={{ ...S.btnPrimary, border: 'none' }} className="desktop-only">+ Add Item</button>}
          {!showExtras && <div style={{ position: 'relative' }}>
            <button onClick={() => setShowExportMenu(v => !v)} style={S.btnGhost} title="Export options" aria-label="Export options">Export ▾</button>
            {showExportMenu && <><div style={{ position: 'fixed', inset: 0, zIndex: 149 }} onClick={() => setShowExportMenu(false)} />
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 150, background: T.s2, border: `1px solid ${T.bd2}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden', minWidth: 120 }}>
              <button onClick={() => { exportPdf(); setShowExportMenu(false); }} style={{ padding: '12px 14px', fontSize: 12, color: T.tx, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: 'transparent', border: 'none', width: '100%', fontFamily: T.sans }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.re, strokeWidth: 2 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                PDF
              </button>
              <button onClick={() => {
                if (filtered.length === 0) { addToast('Nothing to export — no items match the current filters', 'error'); setShowExportMenu(false); return; }
                const csv = 'Batch,SKU,Category,Size,Status,Location,Missing,Damaged\n' + filtered.map(i => `${i.batch_number || ''},${i.serial_number || ''},"${i.products?.name || ''}",${i.size || ''},${i.status},${i.location || ''},"${(itemMissing[i.id] || []).join('; ')}","${(itemDamaged[i.id] || []).join('; ')}"`).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Inventory_${stage}_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
                setShowExportMenu(false);
              }} style={{ padding: '12px 14px', fontSize: 12, color: T.tx, cursor: 'pointer', borderTop: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, background: 'transparent', border: 'none', borderTopStyle: 'solid' as const, width: '100%', fontFamily: T.sans }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: T.gr, strokeWidth: 2 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                CSV
              </button>
            </div></>}
          </div>}
          {!showExtras && (!isCompletedView || profile?.module_access?.extras !== false) && <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMore(v => !v)} style={S.btnGhost} title="More actions" aria-label="More actions">More &#8943;</button>
            {showMore && <><div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setShowMore(false)} />
            <div className="inv-more-dropdown" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 10, background: T.s2, border: `1px solid ${T.bd}`, borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column' as const, gap: 4, minWidth: 160 }}>
              {!isCompletedView && <button onClick={() => { setShowMore(false); computeIntel(); }} style={{ ...S.btnGhost, width: '100%', justifyContent: 'flex-start', border: 'none', background: 'oklch(0.78 0.18 75 / .05)', color: T.yl, fontWeight: 600 }} title="Find cross-size completion possibilities">Find Pairs</button>}
              {profile?.module_access?.extras !== false && <button onClick={() => { setShowMore(false); setShowExtras(true); window.history.pushState({ view: 'extras' }, ''); }} style={{ ...S.btnGhost, width: '100%', justifyContent: 'flex-start', border: 'none', background: 'linear-gradient(135deg, oklch(0.55 0.22 265 / .08), oklch(0.77 0.14 230 / .06))', color: T.ac2, fontWeight: 600, gap: 6 }} title="Manage spare parts">
                <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, flexShrink: 0 }}><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /></svg>
                Spare Parts
              </button>}
            </div></>}
          </div>}
        </div>
      </div>
      {showExtras && profile?.module_access?.extras !== false ? <><div style={{ marginBottom: 10 }}><button onClick={() => { setShowExtras(false); window.history.back(); }} style={S.btnGhost}>← Back to Inventory</button></div><InventoryExtras /></> : <>
      {/* Preset chips + search + Filters popover — Brand Tags glass-card aesthetic */}
      <div className="filter-bar" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: activeFilterCount > 0 ? 10 : 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, product, notes…" style={{ ...S.fSearch, background: 'transparent', border: 'none' }} />
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PRESETS.filter(p => isCompletedView ? p.id === 'all' : true).map(p => (
            <button key={p.id} onClick={() => applyPreset(p)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${preset === p.id ? 'oklch(0.55 0.22 265 / .35)' : T.bd2}`, cursor: 'pointer', fontSize: 12, fontWeight: preset === p.id ? 600 : 500, background: preset === p.id ? 'oklch(0.55 0.22 265 / .10)' : 'rgba(255,255,255,0.02)', color: preset === p.id ? T.ac2 : T.tx2, fontFamily: T.sans, transition: T.transition, height: 32 }}>{p.label}</button>
          ))}
        </div>

        {/* Filters button with multi-select popover */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowFiltersPopover(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px', background: showFiltersPopover || activeFilterCount > 0 ? 'oklch(0.55 0.22 265 / .10)' : 'rgba(255,255,255,0.02)', border: `1px solid ${showFiltersPopover || activeFilterCount > 0 ? 'oklch(0.55 0.22 265 / .35)' : T.bd2}`, borderRadius: 8, color: activeFilterCount > 0 ? T.ac2 : T.tx2, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>
            <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
            Filters
            {activeFilterCount > 0 && <span style={{ background: T.ac, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontFamily: T.mono, fontWeight: 600, minWidth: 18, textAlign: 'center' as const }}>{activeFilterCount}</span>}
            <span style={{ fontSize: 10, color: T.tx3 }}>{showFiltersPopover ? '▴' : '▾'}</span>
          </button>

          {showFiltersPopover && (<>
            <div className="inv-filter-backdrop" onClick={() => setShowFiltersPopover(false)} style={{ position: 'fixed', inset: 0, zIndex: 110 }} />
            <div className="inv-filter-popover" style={{ position: 'absolute', top: 40, right: 0, width: 460, zIndex: 111, background: 'rgba(14,18,30,0.98)', border: `1px solid ${T.bd2}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.55)', overflow: 'hidden', animation: 'fi .15s ease' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Filter items</div>
                {activeFilterCount > 0 && <button onClick={clearFilters} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', fontFamily: T.sans }}>Clear all</button>}
              </div>
              <div style={{ padding: '6px 0', maxHeight: 440, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {([
                  { key: 'status' as const, label: 'Status', options: ['unsorted','damaged','dry_clean','completed'].map(v => ({ value: v, label: v.replace('_',' ') })), show: !isCompletedView },
                  { key: 'category' as const, label: 'Category', options: products.map(p => ({ value: p.id, label: p.name })), show: products.length > 0 },
                  { key: 'location' as const, label: 'Location', options: locations.map(l => ({ value: l.name, label: l.name })), show: locations.length > 0 },
                  { key: 'marketplace' as const, label: 'Marketplace', options: MARKETPLACES.map(m => ({ value: m, label: m })), show: true },
                  { key: 'manufacturer' as const, label: 'Manufacturer', options: manufacturers.map(m => ({ value: m, label: m })), show: manufacturers.length > 0 },
                  { key: 'tag' as const, label: 'Tag', options: tags.map(t => ({ value: t.id, label: t.name })), show: tags.length > 0 },
                ].filter(f => f.show)).map(f => (
                  <div key={f.key} style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1.3, fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{f.label}</span>
                      {filters[f.key].length > 0 && <span style={{ color: T.ac2, letterSpacing: 0 }}>{filters[f.key].length} selected</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                      {f.options.map(opt => {
                        const on = filters[f.key].includes(opt.value);
                        const dotColor = f.key === 'status' ? (STATUS_DOT_COLOR[opt.value] || T.tx3) : '';
                        return (
                          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: on ? 'oklch(0.55 0.22 265 / .08)' : 'transparent', transition: 'background .08s' }} onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.02)'; }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                            <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${on ? T.ac : T.bd2}`, background: on ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .1s' }}>
                              {on && <svg viewBox="0 0 24 24" style={{ width: 10, height: 10, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><path d="M20 6L9 17l-5-5" /></svg>}
                            </div>
                            <input type="checkbox" checked={on} onChange={() => toggleFilterVal(f.key, opt.value)} style={{ display: 'none' }} />
                            <span style={{ fontSize: 12, color: T.tx, textTransform: f.key === 'status' ? 'capitalize' as const : 'none' }}>{opt.label}</span>
                            {dotColor && <span style={{ width: 6, height: 6, borderRadius: 3, background: dotColor, marginLeft: 'auto', boxShadow: `0 0 6px ${dotColor}80` }} />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: 10, color: T.tx3 }}>{activeFilterCount > 0 ? `Showing ${filtered.length} of ${items.length}` : 'No filters applied'}</span>
                <button onClick={() => setShowFiltersPopover(false)} style={S.btnPrimary}>Done</button>
              </div>
            </div>
          </>)}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (() => {
        const chips: { field: keyof typeof filters; value: string; label: string; display: string }[] = [];
        (['status','category','location','marketplace','tag'] as const).forEach(field => {
          const fieldLabel = { status: 'Status', category: 'Category', location: 'Location', marketplace: 'Marketplace', tag: 'Tag' }[field];
          filters[field].forEach(v => {
            let display = v;
            if (field === 'category') display = products.find(p => p.id === v)?.name || v;
            else if (field === 'tag') display = tags.find(t => t.id === v)?.name || v;
            else if (field === 'status') display = v.replace('_', ' ');
            chips.push({ field, value: v, label: fieldLabel, display });
          });
        });
        return (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1.4, fontWeight: 600, marginRight: 2 }}>Active:</span>
            {chips.map(c => (
              <button key={`${c.field}-${c.value}`} onClick={() => removeChip(c.field, c.value)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 6px 4px 10px', background: 'oklch(0.55 0.22 265 / .08)', border: '1px solid oklch(0.55 0.22 265 / .25)', borderRadius: 6, color: T.ac2, fontSize: 11, fontFamily: T.sans, cursor: 'pointer' }}>
                <span style={{ color: T.tx3, fontSize: 10 }}>{c.label}:</span>
                <span style={{ textTransform: c.field === 'status' ? 'capitalize' as const : 'none' }}>{c.display}</span>
                <span style={{ width: 15, height: 15, borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.06)', fontSize: 11, lineHeight: 1 }} aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        );
      })()}
      {loading && items.length === 0 && <SkeletonRows rows={6} />}
      <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden', display: loading && items.length === 0 ? 'none' : undefined }}>
        {/* Desktop table */}
        <div className="inv-desktop">
        <div className="table-wrap">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead><tr>
            {canEdit && <th style={{ ...S.thStyle, width: 32, paddingLeft: 10, paddingRight: 4 }}>
              <input
                type="checkbox"
                checked={paged.length > 0 && paged.every(i => selectedIds.has(i.id))}
                onChange={e => {
                  const next = new Set(selectedIds);
                  if (e.target.checked) paged.forEach(i => next.add(i.id));
                  else paged.forEach(i => next.delete(i.id));
                  setSelectedIds(next);
                }}
                title="Select all on page"
                style={{ cursor: 'pointer' }}
              />
            </th>}
            {['Unique ID', 'SKU', 'Category', 'Size', 'Age', 'Tags', 'Notes', 'Status', 'Issues', 'Actions'].map((h) => <th key={h} style={S.thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>{paged.map((item) => {
            const missing = itemMissing[item.id] || [];
            const damaged = itemDamaged[item.id] || [];
            return (<tr key={item.id} id={'row-' + item.id} style={{ transition: 'background .2s', background: selectedIds.has(item.id) ? 'oklch(0.55 0.22 265 / .10)' : highlightId === item.id ? 'oklch(0.55 0.22 265 / .08)' : 'transparent' }} onMouseEnter={e => { if (highlightId !== item.id && !selectedIds.has(item.id)) e.currentTarget.style.background = 'rgba(255,255,255,.015)'; }} onMouseLeave={e => { if (highlightId !== item.id && !selectedIds.has(item.id)) e.currentTarget.style.background = 'transparent'; }}>
            {canEdit && <td style={{ ...S.tdStyle, width: 32, paddingLeft: 10, paddingRight: 4 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  const next = new Set(selectedIds);
                  if (e.target.checked) next.add(item.id); else next.delete(item.id);
                  setSelectedIds(next);
                }}
                style={{ cursor: 'pointer' }}
              />
            </td>}
            <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 10, whiteSpace: 'nowrap' }}><span style={{ color: T.gr }}>{item.batch_number || '—'}</span>{isCompletedView && item.paired_with && (() => { const pair = items.find(p => p.id === item.paired_with); return pair ? <button onClick={() => scrollToPair(item.paired_with)} style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }} title="Click to find paired item" aria-label="Scroll to paired item"><svg viewBox="0 0 24 24" style={{ width: 9, height: 9, fill: 'none', stroke: T.ac2, strokeWidth: 2, flexShrink: 0 }}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg><span style={{ fontSize: 9, color: T.ac2 }}>{pair.batch_number}</span></button> : null; })()}</td>
            <td title={item.serial_number || ''} style={{ ...S.tdStyle, fontFamily: T.mono, color: T.ac2, fontSize: 10 }}>{item.serial_number || '—'}{item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: T.bl, verticalAlign: 'middle' }}><Icon name="link" size={10} /></a>}</td>
            <td title={item.products?.name || ''} style={{ ...S.tdStyle, fontSize: 11 }}><span style={{ fontWeight: 500 }}>{item.products?.name}</span></td>
            <td style={{ ...S.tdStyle, fontSize: 10, fontWeight: 500 }}>{item.size || '—'}</td>
            <td style={S.tdStyle}>{item.created_at && (() => { const d = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000); return <span style={{ fontSize: 10, fontWeight: 600, color: d > 30 ? T.re : d > 14 ? T.yl : T.tx3 }}>{new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · {d}d</span>; })()}</td>
            <td style={S.tdStyle}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{(itemTags[item.id] || []).map((t: any) => t && <span key={t.id} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'oklch(0.55 0.22 265 / .10)', color: T.ac2 }}>{t.name}</span>)}{(itemTags[item.id] || []).length === 0 && <span style={{ color: T.tx3, fontSize: 10 }}>—</span>}</div></td>
            <td style={{ ...S.tdStyle, fontSize: 11, maxWidth: 140 }}>{item.notes ? <button onClick={() => setExpandedNote(expandedNote === item.id ? null : item.id)} style={{ color: T.tx2, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 'inherit', fontFamily: 'inherit', textAlign: 'left' }} title="Toggle notes" aria-label="Toggle notes">{expandedNote === item.id ? item.notes : item.notes.length > 25 ? item.notes.slice(0, 25) + '...' : item.notes}</button> : <span style={{ color: T.tx3 }}>—</span>}</td>

            <td style={S.tdStyle}><span style={statusTag(item.status)}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', boxShadow: `0 0 4px currentColor`, flexShrink: 0 }} /><span style={{ textTransform: 'capitalize' }}>{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></span></td>
            <td style={S.tdStyle}>{(missing.length > 0 || damaged.length > 0) ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{missing.map((name, i) => <span key={'m'+i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'oklch(0.78 0.18 75 / .08)', color: T.yl }}>Missing: {name}</span>)}{damaged.map((name, i) => <span key={'d'+i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(248,113,113,.08)', color: T.re }}>Damaged: {name}</span>)}</div> : <span style={{ color: T.tx3, fontSize: 10 }}>{item.status === 'completed' ? 'All good' : '—'}</span>}</td>
            <td style={S.tdStyle}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <button onClick={() => openComps(item)} style={{ ...S.btnPrimary, ...S.btnSm }}>View</button>
                {!isCompletedView && item.status !== 'dry_clean' && completablePairs[item.id]?.length > 0 && <button onClick={() => setShowCompleteModal({ itemId: item.id })} style={{ ...S.btnSm, padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: T.sans, background: 'oklch(0.72 0.19 145 / .12)', color: T.gr, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' as const }}>Complete ({completablePairs[item.id].length})</button>}
                {isCompletedView && canEdit && <button onClick={async () => { if (await ask({ title: item.paired_with ? 'Revert paired items?' : 'Revert this item?', message: item.paired_with ? 'This will revert BOTH paired items back to Inventory.' : 'This item will return to Inventory.', confirmLabel: 'Revert', danger: true })) handleCancelCompletion(item.id); }} style={{ ...S.btnSm, padding: '4px 10px', borderRadius: 5, border: '1px solid oklch(0.78 0.18 75 / .15)', cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: T.sans, background: 'oklch(0.78 0.18 75 / .05)', color: T.yl, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' as const, pointerEvents: revertingId ? 'none' as const : 'auto' as const, opacity: revertingId === item.id ? 0.6 : 1 }}>{revertingId === item.id ? 'Reverting…' : `Revert${item.paired_with ? ' Both' : ''}`}</button>}
                {canEdit && <button onClick={() => openEdit(item)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>}
                {canEdit && <button onClick={() => handleDelete(item.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Del</button>}
              </div>
            </td>
          </tr>);})}</tbody>
        </table>
        </div>
        </div>
        {/* Mobile card view */}
        <div className="inv-mobile">
          {paged.map((item, idx) => {
            const missing = itemMissing[item.id] || [];
            const damaged = itemDamaged[item.id] || [];
            const swipeActions = [
              { label: 'View', color: '#6366F1', onClick: () => openComps(item) },
              ...(canEdit ? [{ label: 'Edit', color: '#3B82F6', onClick: () => openEdit(item) }] : []),
              ...(canEdit ? [{ label: 'Del', color: '#EF4444', onClick: () => handleDelete(item.id) }] : []),
            ];
            return (
              <SwipeRow key={item.id} actions={swipeActions} hint={idx === 0} hintKey="inventory">
              <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.bd}`, borderLeft: `3px solid ${STATUS_DOT_COLOR[item.status] || T.yl}`, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', WebkitUserSelect: 'none', userSelect: 'none' }}
                onTouchStart={() => { if (!canEdit || item.status === 'completed') return; longPressTimer.current = setTimeout(() => { try { navigator.vibrate?.(15); } catch {} setQuickStatusItem(item.id); }, 500); }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
                onTouchMove={() => clearTimeout(longPressTimer.current)}>
                {quickStatusItem === item.id && (<>
                  <div onClick={e => { e.stopPropagation(); setQuickStatusItem(null); }} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)' }} />
                  <div style={{ position: 'fixed', left: '50%', top: '40%', transform: 'translate(-50%, -50%)', zIndex: 1000, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.6)', overflow: 'hidden', animation: 'fi .15s ease', minWidth: 240 }}>
                    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...statusTag(item.status), margin: 0 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} /><span style={{ textTransform: 'capitalize', fontSize: 9 }}>{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.products?.name || '—'}</div>
                        <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{item.serial_number || '—'} · {item.size || '—'}</div>
                      </div>
                    </div>
                    <div style={{ padding: '6px 0' }}>
                    {['unsorted', 'damaged', 'dry_clean', 'completed'].filter(s => s !== item.status).map(s => (
                      <button key={s} onClick={e => { e.stopPropagation(); quickStatusChange(item.id, s); }} style={{ padding: '12px 18px', fontSize: 14, color: T.tx, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', width: '100%', fontFamily: T.sans }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: s === 'completed' ? T.gr : s === 'damaged' ? T.re : s === 'dry_clean' ? T.bl : T.yl }} />{s === 'dry_clean' ? 'Dry Clean' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                    ))}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setQuickStatusItem(null); }} style={{ padding: '12px 18px', fontSize: 13, color: T.tx3, cursor: 'pointer', textAlign: 'center', borderTop: `1px solid ${T.bd}`, background: 'none', border: 'none', width: '100%', fontFamily: T.sans }}>Cancel</button>
                  </div>
                </>)}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2, fontWeight: 600 }}>{item.serial_number || '—'}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.tx, marginTop: 2 }}>{item.products?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{item.size || '—'} · {item.location || '—'}{item.created_at && (() => { const d = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000); const dt = new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); return <><span> · {dt}</span>{d > 0 ? <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: d > 30 ? 'oklch(0.63 0.22 25 / .1)' : d > 14 ? 'oklch(0.78 0.18 75 / .1)' : 'rgba(255,255,255,.04)', color: d > 30 ? T.re : d > 14 ? T.yl : T.tx3 }}>{d}d</span> : null}</>; })()}</div>
                  </div>
                  <span style={statusTag(item.status)}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 4px currentColor', flexShrink: 0 }} /><span style={{ textTransform: 'capitalize', fontSize: 10 }}>{item.status === 'dry_clean' ? 'Dry Clean' : item.status}</span></span>
                </div>
                {(missing.length > 0 || damaged.length > 0) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{missing.map((name, i) => <span key={'m'+i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'oklch(0.78 0.18 75 / .08)', color: T.yl }}>Missing: {name}</span>)}{damaged.map((name, i) => <span key={'d'+i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(248,113,113,.08)', color: T.re }}>Damaged: {name}</span>)}</div>}
              </div>
              </SwipeRow>
            );
          })}
        </div>
        {filtered.length === 0 && <div style={{ padding: 14 }}>{hasActiveFilters
          ? <Empty icon="search" title="No items match your filters" message="Try adjusting the filters, or click Clear filters to reset." cta="Clear filters" onCta={clearFilters} />
          : <Empty icon="box" title="No items yet" message="Register your first inventory item to start tracking components and pair matches." cta={canEdit ? '+ Add Item' : undefined} onCta={canEdit ? () => setShowModal(true) : undefined} />
        }</div>}
      </div>
      <div className="pager" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 11 }}>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ ...S.fInput, width: 'auto', padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, cursor: 'pointer' }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select>
        <span style={{ color: T.tx3 }}>rows</span>
        {totalPages > 1 && <>
          <button onClick={() => setPage(Math.max(0, page - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }} aria-label="Previous page">Prev</button>
          <span style={{ color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }} aria-label="Next page">Next</button>
        </>}
        {invTruncated && <button onClick={() => { setInvLimit(p => p + 5000); fetchData(); }} style={{ ...S.btnGhost, fontSize: 10, color: T.yl, borderColor: 'oklch(0.78 0.18 75 / .2)', background: 'oklch(0.78 0.18 75 / .06)' }}>Load More Items ({invLimit} loaded)</button>}
      </div>

      {/* Bulk-actions dock — appears when rows are selected (audit P1) */}
      {canEdit && selectedIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: 'rgba(14,18,30,0.98)', backdropFilter: 'blur(24px)', border: `1px solid ${T.bd2}`, borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.55)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: 'calc(100vw - 24px)', animation: 'slideDown .18s ease' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>{selectedIds.size} selected</span>
          <span style={{ width: 1, height: 18, background: T.bd2 }} />
          <select
            value=""
            disabled={bulkBusy}
            onChange={async e => {
              const newStatus = e.target.value;
              if (!newStatus) return;
              const ids = Array.from(selectedIds);
              if (newStatus === 'completed') {
                const problemIds: string[] = [];
                for (const id of ids) {
                  const missing = itemMissing[id];
                  const damaged = itemDamaged[id];
                  if ((missing && missing.length > 0) || (damaged && damaged.length > 0)) problemIds.push(id);
                }
                if (problemIds.length > 0) {
                  const names = problemIds.map(id => items.find(i => i.id === id)?.batch_number || id).join(', ');
                  addToast(`Cannot complete ${problemIds.length} item${problemIds.length > 1 ? 's' : ''} with missing/damaged components: ${names}`, 'error');
                  e.target.value = '';
                  return;
                }
              }
              if (!await ask({ title: 'Change status?', message: `Change status of ${ids.length} item${ids.length === 1 ? '' : 's'} to "${newStatus}".`, confirmLabel: 'Change' })) { e.target.value = ''; return; }
              setBulkBusy(true);
              const { error } = await supabase.from('inventory_items').update({ status: newStatus }).in('id', ids);
              setBulkBusy(false);
              if (error) { addToast(friendlyError(error), 'error'); return; }
              addToast(`${ids.length} item${ids.length === 1 ? '' : 's'} → ${newStatus}`, 'success');
              setSelectedIds(new Set());
              fetchData();
            }}
            style={{ ...S.fInput, width: 'auto', padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <option value="">Change status to…</option>
            <option value="completed">Completed</option>
            <option value="unsorted">Unsorted</option>
            <option value="dry_clean">Dry Clean</option>
            <option value="damaged">Damaged</option>
          </select>
          <select
            value=""
            disabled={bulkBusy}
            onChange={async e => {
              const newLoc = e.target.value;
              if (!newLoc) return;
              if (!await ask({ title: 'Change location?', message: `Move ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} to "${newLoc}".`, confirmLabel: 'Move' })) { e.target.value = ''; return; }
              setBulkBusy(true);
              const { error } = await supabase.from('inventory_items').update({ location: newLoc }).in('id', Array.from(selectedIds));
              setBulkBusy(false);
              if (error) { addToast(friendlyError(error), 'error'); return; }
              addToast(`${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} → ${newLoc}`, 'success');
              setSelectedIds(new Set());
              fetchData();
            }}
            style={{ ...S.fInput, width: 'auto', padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
          >
            <option value="">Move to…</option>
            {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
          <button
            disabled={bulkBusy}
            onClick={async () => {
              if (!await ask({ title: `Delete ${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'}?`, message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true })) return;
              setBulkBusy(true); setBulkDeleting(true);
              const ids = Array.from(selectedIds);
              let failed = 0;
              for (const id of ids) {
                const { error } = await supabase.rpc('delete_inventory_item_cascade', { p_item_id: id });
                if (error) failed++;
              }
              setBulkBusy(false); setBulkDeleting(false);
              if (failed > 0) addToast(`${ids.length - failed} deleted, ${failed} failed`, 'error');
              else addToast(`${ids.length} item${ids.length === 1 ? '' : 's'} deleted`, 'success');
              setSelectedIds(new Set());
              fetchData();
            }}
            style={{ ...S.btnDanger, padding: '6px 12px', fontSize: 11 }}
          >{bulkDeleting ? 'Deleting…' : 'Delete'}</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11 }}>Clear</button>
        </div>
      )}

      {!showModal && !showExtras && canEdit && !isCompletedView && <button className="fab" aria-label="Add new item" onClick={() => { setSelected(null); setForm({ product_id: '', serial_number: '', size: '', status: 'unsorted', location: '', manufacturer: '', notes: '', order_id: '', marketplace: '', ticket_id: '', link: '' }); setCatSearch(''); setCatComps([]); setMissingComps(new Set()); setDamagedComps(new Set()); setTagInput(''); setShowModal(true); }}>+</button>}
      {showModal && createPortal(<div style={S.modalOverlay} onClick={resetForm}><div className="modal-inner" style={S.modalBox} onClick={e => e.stopPropagation()}><div style={S.modalHead}><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected ? 'Edit' : 'Add'} Item</span><button onClick={resetForm} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, background: 'none', border: 'none' }} title="Close" aria-label="Close">✕</button></div><form onSubmit={handleSubmit} style={{ padding: 16 }}><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>Category *</label><input value={catSearch} onChange={(e) => { setCatSearch(e.target.value); setShowCatDrop(true); setForm({ ...form, product_id: '' }); }} onFocus={() => setShowCatDrop(true)} onBlur={() => setTimeout(() => setShowCatDrop(false), 200)} placeholder="Type to search categories by name or SKU..." style={{ ...S.fInput, opacity: selected ? 0.6 : 1 }} autoComplete="off" disabled={!!selected} /><input type="hidden" value={form.product_id} required />{form.product_id && <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: T.r, background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', fontSize: 12, color: T.ac2 }}>{products.find(p => p.id === form.product_id)?.name} <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{products.find(p => p.id === form.product_id)?.sku}</span><button onClick={() => { setForm({ ...form, product_id: '' }); setCatSearch(''); }} style={{ cursor: 'pointer', marginLeft: 4, opacity: 0.6, background: 'none', border: 'none', color: 'inherit' }} title="Clear category" aria-label="Clear category">✕</button></div>}{showCatDrop && !form.product_id && (() => { const q = catSearch.toLowerCase(); const filtered = products.filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))); return filtered.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>{filtered.map(p => <div key={p.id} onClick={() => { setForm({ ...form, product_id: p.id }); setCatSearch(p.name); setShowCatDrop(false); supabase.from('components').select('id, name').eq('product_id', p.id).then(({ data }) => { setCatComps(data || []); setMissingComps(new Set()); setDamagedComps(new Set()); const allDup = (data || []).length > 0 && (data || []).every((c: any) => isDupatta(c.name)); if (allDup) setForm(f => ({ ...f, size: 'N/A' })); }); }} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><span style={{ fontSize: 13, color: T.tx }}>{p.name}</span><span style={{ fontSize: 11, fontFamily: T.mono, color: T.tx3 }}>{p.sku}</span></div>)}</div> : catSearch ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, padding: '12px 14px', fontSize: 12, color: T.tx3, zIndex: 10 }}>No categories found</div> : null; })()}</div><div style={{ marginBottom: 10, position: 'relative' }}><label style={S.fLabel}>SKU Code <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 9 }}>(unique identifier)</span></label><input value={form.serial_number} onChange={(e) => { const v = e.target.value; const autoMfr = mfrFromSku(v); setForm(f => ({ ...f, serial_number: v, ...(autoMfr && (!f.manufacturer || mfrFromSku(f.serial_number) === f.manufacturer) ? { manufacturer: autoMfr } : {}) })); setShowSkuDrop(true); }} onFocus={() => setShowSkuDrop(true)} onBlur={() => setTimeout(() => setShowSkuDrop(false), 150)} placeholder="e.g. LC-001-A" style={{ ...S.fInput, fontFamily: T.mono }} autoComplete="off" />{showSkuDrop && form.serial_number && (() => { const q = form.serial_number.toLowerCase(); const existing = [...new Set(items.map(i => i.serial_number).filter(Boolean))]; const matches = existing.filter(s => s.toLowerCase().includes(q) && s !== form.serial_number); return matches.length > 0 ? <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: T.r, maxHeight: 140, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,.3)' }}>{matches.slice(0, 8).map(s => <div key={s} onMouseDown={() => { const autoMfr = mfrFromSku(s); setForm(f => ({ ...f, serial_number: s, ...(autoMfr && (!f.manufacturer || mfrFromSku(f.serial_number) === f.manufacturer) ? { manufacturer: autoMfr } : {}) })); setShowSkuDrop(false); }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, fontFamily: T.mono, color: T.ac2, borderBottom: `1px solid ${T.bd}`, transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = T.s2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{s}</div>)}</div> : null; })()}</div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Size <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, fontSize: 9 }}>(N/A for Dupatta · Semi-Stitched for Lehenga)</span></label><select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} style={S.fInput}><option value="">Select size...</option>{SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div><label style={S.fLabel}>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={S.fInput}><option value="unsorted">Unsorted</option><option value="damaged">Damaged</option><option value="dry_clean">Dry Clean</option><option value="completed">Completed</option></select></div></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Location *</label><select value={form.location} required onChange={(e) => setForm({ ...form, location: e.target.value })} style={S.fInput}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}</select></div><div><label style={S.fLabel}>Marketplace</label><select value={form.marketplace} onChange={(e) => setForm({ ...form, marketplace: e.target.value })} style={S.fInput}><option value="">Select</option>{MARKETPLACES.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div><div style={{ marginBottom: 12 }}><label style={S.fLabel}>Manufacturer *</label><input list="mfr-list" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="Type or select manufacturer..." style={S.fInput} required /><datalist id="mfr-list">{manufacturers.map(m => <option key={m} value={m} />)}</datalist></div>{(form.status === 'unsorted' || form.status === 'damaged' || form.status === 'dry_clean') && catComps.length > 0 && <div style={{ marginBottom: 14 }}>
  <label style={S.fLabel}>Component Status <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>{form.status === 'dry_clean' ? '(click to toggle: Not Sending ↔ Sending)' : '(click to toggle: Present → Missing → Damaged)'}</span></label>
  {form.status === 'unsorted' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
    <button onClick={() => { setMissingComps(new Set()); setDamagedComps(new Set()); }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid oklch(0.72 0.19 145 / .2)', background: 'oklch(0.72 0.19 145 / .06)', color: T.gr, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>All Present</button>
    <button onClick={() => { setMissingComps(new Set(catComps.map((c: any) => c.id))); setDamagedComps(new Set()); }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid oklch(0.78 0.18 75 / .2)', background: 'oklch(0.78 0.18 75 / .06)', color: T.yl, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>All Missing</button>
  </div>}
  {form.status === 'damaged' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
    <button onClick={() => { setDamagedComps(new Set(catComps.map((c: any) => c.id))); setMissingComps(new Set()); }} style={{ ...S.btnDanger, fontSize: 10, padding: '4px 10px', cursor: 'pointer' }}>Mark All Damaged</button>
    <button onClick={() => { setDamagedComps(new Set()); setMissingComps(new Set()); }} style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px' }}>Reset All</button>
  </div>}
  {form.status === 'dry_clean' && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
    <button onClick={() => { setMissingComps(new Set(catComps.map((c: any) => c.id))); setDamagedComps(new Set()); }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(125,211,252,.2)', background: 'rgba(125,211,252,.06)', color: T.bl, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Send All</button>
    <button onClick={() => { setMissingComps(new Set()); setDamagedComps(new Set()); }} style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px' }}>Reset All</button>
  </div>}
  <div style={{ background: T.s2, border: `1px solid ${T.bd}`, borderRadius: T.r, padding: 8 }}>{catComps.map(c => {
    const isMissing = missingComps.has(c.id);
    const isDamaged = damagedComps.has(c.id);
    const isDryClean = form.status === 'dry_clean';
    const isSending = isDryClean && isMissing;
    const state = isDryClean ? (isSending ? 'sending' : 'not_sending') : (isDamaged ? 'damaged' : isMissing ? 'missing' : 'present');
    const cycle = () => {
      const m = new Set(missingComps); const d = new Set(damagedComps);
      if (isDryClean) {
        if (isSending) m.delete(c.id); else m.add(c.id);
        d.delete(c.id);
      } else {
        if (state === 'present') { m.add(c.id); d.delete(c.id); }
        else if (state === 'missing') { m.delete(c.id); d.add(c.id); }
        else { m.delete(c.id); d.delete(c.id); }
      }
      setMissingComps(m); setDamagedComps(d);
    };
    const bg = isDryClean ? (isSending ? 'rgba(125,211,252,.08)' : 'transparent') : (isDamaged ? 'rgba(248,113,113,.08)' : isMissing ? 'oklch(0.78 0.18 75 / .08)' : 'transparent');
    const bdr = isDryClean ? (isSending ? 'rgba(125,211,252,.3)' : 'transparent') : (isDamaged ? 'rgba(248,113,113,.3)' : isMissing ? 'oklch(0.78 0.18 75 / .3)' : 'transparent');
    const clr = isDryClean ? (isSending ? T.bl : T.tx3) : (isDamaged ? T.re : isMissing ? T.yl : T.gr);
    const label = isDryClean ? (isSending ? 'SENDING' : 'NOT SENDING') : state.toUpperCase();
    return <div key={c.id} onClick={cycle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3, background: bg, border: `1px solid ${bdr}`, transition: 'all .12s' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: clr, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: state === 'present' || state === 'not_sending' ? T.tx : clr, flex: 1 }}>{c.name}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: clr, textTransform: 'uppercase' as const }}>{label}</span>
    </div>;
  })}</div>
  {form.status === 'dry_clean' && missingComps.size > 0 && <p style={{ fontSize: 10, color: T.bl, marginTop: 5 }}>{missingComps.size} component{missingComps.size > 1 ? 's' : ''} being sent for dry cleaning</p>}
  {form.status === 'dry_clean' && missingComps.size === 0 && <p style={{ fontSize: 11, color: T.yl, marginTop: 5, background: 'oklch(0.78 0.18 75 / .06)', border: '1px solid oklch(0.78 0.18 75 / .15)', borderRadius: 6, padding: '6px 10px' }}>Select at least one component to send for dry cleaning.</p>}
  {form.status !== 'dry_clean' && missingComps.size > 0 && <p style={{ fontSize: 10, color: T.yl, marginTop: 5 }}>{missingComps.size} missing</p>}
  {form.status !== 'dry_clean' && damagedComps.size > 0 && <p style={{ fontSize: 10, color: T.re, marginTop: 3 }}>{damagedComps.size} damaged</p>}
  {form.status === 'unsorted' && missingComps.size === catComps.length && damagedComps.size === 0 && <p style={{ fontSize: 11, color: T.re, marginTop: 5, background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)', borderRadius: 6, padding: '6px 10px' }}>All missing — change status to "Damaged" or deselect some.</p>}
</div>}<div className="inv-more-fields" onClick={() => setShowMoreFields(v => !v)} style={{ display: 'none', padding: '8px 0', marginBottom: 8, cursor: 'pointer', fontSize: 11, color: T.ac2, fontWeight: 500, textAlign: 'center' }}>{showMoreFields ? '— Less details' : '+ More details (Order ID, Tags, Notes)'}</div><div className={showMoreFields ? '' : 'inv-more-content'}><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Order ID</label><input value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div><div><label style={S.fLabel}>Ticket ID</label><input value={form.ticket_id} onChange={(e) => setForm({ ...form, ticket_id: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div><div style={{ marginBottom: 12 }}><label style={S.fLabel}>Link</label><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Optional URL" style={S.fInput} /></div><div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}><div><label style={S.fLabel}>Tags <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(comma separated)</span></label><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. urgent, wedding" style={S.fInput} /></div><div><label style={S.fLabel}>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" style={S.fInput} /></div></div></div><div style={{ position: 'sticky', bottom: 0, zIndex: 2, padding: '14px 16px', borderTop: `1px solid ${T.bd}`, background: T.s2, display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button onClick={resetForm} style={{ ...S.btnGhost, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' as const : 'auto' as const }}>Cancel</button><button type="submit" disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' as const : 'auto' as const }}>{saving ? 'Saving…' : selected ? 'Update' : 'Add'}</button></div></form></div></div>, document.body)}

      {showCompModal && selected && createPortal(<div style={S.modalOverlay} onClick={() => setShowCompModal(false)}><div className="modal-inner" style={{ ...S.modalBox, width: 520 }} onClick={e => e.stopPropagation()}><div style={S.modalHead}><div><span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{selected.products?.name}</span><div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{selected.batch_number}</span>{selected.serial_number && <span style={{ fontSize: 10, fontFamily: T.mono, color: T.ac2 }}>{selected.serial_number}</span>}<span style={statusTag(selected.status)}>{selected.status}</span>{selected.batch_number && <button onClick={() => printBarcode(selected.batch_number)} style={{ ...S.btnGhost, ...S.btnSm }}>Print Barcode</button>}</div>{selected.order_id && <p style={{ margin: '3px 0 0', fontSize: 10, color: T.tx3 }}>Order: {selected.order_id}{selected.marketplace ? ` | ${selected.marketplace}` : ''}</p>}{selected.ticket_id && <p style={{ margin: '2px 0 0', fontSize: 10, color: T.tx3 }}>Ticket: {selected.ticket_id}</p>}{selected.link && <a href={selected.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.ac, marginTop: 2, display: 'block' }}>Open Link</a>}</div><button onClick={() => setShowCompModal(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, background: 'none', border: 'none' }} title="Close" aria-label="Close">✕</button></div><div style={{ padding: 16 }}>
        <p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Components</p>
        {comps.map((c) => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${c.status === 'missing' ? 'rgba(245,166,35,.2)' : T.bd}`, borderRadius: 6, marginBottom: 5 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'present' ? T.gr : c.status === 'damaged' ? T.re : T.yl }} /><span style={{ fontWeight: 500, fontSize: 11, color: T.tx }}>{c.components?.name}</span>{c.status === 'missing' && <span style={{ fontSize: 9, color: T.yl, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,166,35,.08)' }}>MISSING</span>}</div>{canEdit && <select value={c.status} onChange={(e) => updateComp(c.id, e.target.value)} style={{ ...S.fInput, width: 'auto', minWidth: 85, padding: '4px 6px', cursor: 'pointer', fontSize: 10 }}><option value="missing">Missing</option><option value="present">Present</option><option value="damaged">Damaged</option></select>}</div>))}
        {comps.length === 0 && <p style={{ textAlign: 'center', color: T.tx3, fontSize: 11, padding: 14 }}>No components</p>}
        {itemLogs.length > 0 && <><div style={{ borderTop: `1px solid ${T.bd}`, marginTop: 12, paddingTop: 12 }}><p style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>Activity History</p>{itemLogs.map(log => <div key={log.id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.bd}`, display: 'flex', gap: 8, fontSize: 10 }}><span style={{ color: T.tx3, whiteSpace: 'nowrap', fontFamily: T.mono, fontSize: 9 }}>{new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><span style={{ color: T.tx2 }}>{log.description || log.action}</span></div>)}</div></>}
      </div></div></div>, document.body)}
      {matchResult && createPortal(<div style={S.modalOverlay} onClick={() => setMatchResult(null)}><div className="modal-inner" style={{ ...S.modalBox, width: 480 }} onClick={e => e.stopPropagation()}><div style={{ ...S.modalHead, background: 'rgba(45,212,160,.05)', borderBottom: `1px solid rgba(45,212,160,.15)` }}><span style={{ fontSize: 13, fontWeight: 600, color: T.gr }}>Pair Match Found!</span><button onClick={() => setMatchResult(null)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, background: 'none', border: 'none' }} title="Close" aria-label="Close">✕</button></div><div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.18)', borderRadius: T.r, padding: 12, marginBottom: 12, fontSize: 11, color: T.gr }}>
          A complete <strong>{matchResult.categoryName}</strong>{matchResult.size && <> in size <strong>{matchResult.size}</strong></>}{matchResult.sku && <> (SKU: <span style={{ fontFamily: T.mono }}>{matchResult.sku}</span>)</>} can be assembled!
        </div>
        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => setMatchResult(null)} style={S.btnPrimary}>Got it</button></div>
      </div></div></div>, document.body)}

      {showCompleteModal && createPortal((() => {
        const itemA = items.find(i => i.id === showCompleteModal.itemId);
        if (!itemA) return null;
        const missingA = itemMissing[itemA.id] || [];
        const pairIds = completablePairs[itemA.id] || [];
        const pairItems = pairIds.map(pid => items.find(i => i.id === pid)).filter(Boolean);
        const selectedPair = showCompleteModal.pairId ? items.find(i => i.id === showCompleteModal.pairId) : null;

        return (<div style={S.modalOverlay} onClick={() => setShowCompleteModal(null)}><div className="modal-inner" style={{ ...S.modalBox, width: 540, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
          <div style={{ ...S.modalHead, background: 'oklch(0.72 0.19 145 / .06)', borderBottom: '1px solid oklch(0.72 0.19 145 / .2)' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.gr }}>Complete Product</span>
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
                {missingA.map(name => <span key={name} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 500, background: 'oklch(0.78 0.18 75 / .12)', color: T.yl }}>{name} missing</span>)}
              </div>
            </div>

            {/* Pair selection */}
            <p style={{ fontSize: 10, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Select item to combine with ({pairItems.length} available)</p>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
              {pairItems.map((b: any) => {
                const missingB = itemMissing[b.id] || [];
                const isSelected = showCompleteModal.pairId === b.id;
                return <div key={b.id} onClick={() => setShowCompleteModal({ ...showCompleteModal, pairId: b.id })} style={{ background: isSelected ? 'oklch(0.72 0.19 145 / .08)' : T.s2, border: `1px solid ${isSelected ? 'oklch(0.72 0.19 145 / .4)' : T.bd}`, borderRadius: T.r, padding: 12, marginBottom: 6, cursor: 'pointer', transition: 'all .15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isSelected ? T.gr : T.bd2}`, background: isSelected ? T.gr : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{isSelected && '✓'}</div>
                      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.gr }}>{b.batch_number}</span>
                      {b.serial_number && <span style={{ fontSize: 11, fontFamily: T.mono, color: T.ac2 }}>{b.serial_number}</span>}
                      {b.size && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: T.s3, color: T.tx2 }}>{b.size}</span>}
                    </div>
                    {b.location && <span style={{ fontSize: 10, color: T.tx3 }}>{b.location}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 26 }}>
                    {missingB.length > 0
                      ? missingB.map(name => <span key={name} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, background: 'oklch(0.78 0.18 75 / .1)', color: T.yl }}>{name} missing</span>)
                      : <span style={{ fontSize: 10, color: T.gr }}>All components present</span>
                    }
                  </div>
                  {isSelected && <div style={{ marginLeft: 26, marginTop: 6, fontSize: 11, color: T.gr }}>Combined = <strong>Complete {itemA.products?.name}</strong></div>}
                </div>;
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setShowCompleteModal(null)} style={S.btnGhost}>Cancel</button>
              <button onClick={() => { if (showCompleteModal.pairId) handleComplete(showCompleteModal.itemId, showCompleteModal.pairId); else addToast('Select an item to combine with', 'error'); }} style={{ ...S.btnSuccessSolid, opacity: completing ? 0.5 : selectedPair ? 1 : 0.5, pointerEvents: completing ? 'none' as const : 'auto' as const, ...(selectedPair ? {} : { background: T.bd2, boxShadow: 'none' }) }}>{completing ? 'Completing…' : 'Mark as Completed'}</button>
            </div>
          </div>
        </div></div>);
      })(), document.body)}

      {pendingDelete && <div style={{ position: 'fixed', bottom: 'calc(var(--nav-h, 8px) + 12px)', left: '50%', transform: 'translateX(-50%)', background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 10, padding: 0, boxShadow: '0 8px 30px rgba(0,0,0,.5)', zIndex: 300, animation: 'su .2s ease', overflow: 'hidden', minWidth: 280 }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: T.tx, flex: 1 }}>Item deleted</span>
          <button onClick={undoDelete} style={{ ...S.btnPrimary, padding: '4px 12px', fontSize: 11, background: T.yl, color: '#fff', boxShadow: 'none' }}>Undo</button>
          <button onClick={() => { clearTimeout(pendingDelete.timer); deleteTimerRef.current = null; const id = pendingDelete.id; setPendingDelete(null); supabase.rpc('delete_inventory_item_cascade', { p_item_id: id }).then(({ error }) => { if (error) addToast('Delete failed — ' + friendlyError(error), 'error'); fetchData(); }); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 14, background: 'none', border: 'none' }} title="Dismiss" aria-label="Dismiss">✕</button>
        </div>
        <div className="undo-bar" key={pendingDelete.id} />
      </div>}

      {/* Find Pairs Modal */}
      {showIntel && createPortal(<div style={S.modalOverlay} onClick={() => setShowIntel(false)}><div className="modal-inner" style={{ ...S.modalBox, width: 580, maxWidth: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.modalHead, background: 'oklch(0.78 0.18 75 / .06)', borderBottom: '1px solid oklch(0.78 0.18 75 / .2)' }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.yl }}>Find Pairs</span>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.tx3 }}>Cross-size completion possibilities (adjacent size alteration)</p>
          </div>
          <button onClick={() => setShowIntel(false)} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1, background: 'none', border: 'none' }} title="Close" aria-label="Close">✕</button>
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
                <span style={{ fontSize: 11, fontWeight: 600, color: T.yl, background: 'oklch(0.78 0.18 75 / .1)', padding: '2px 8px', borderRadius: 4 }}>{r.sizeA} ↔ {r.sizeB}</span>
              </div>
              <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemA.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'oklch(0.78 0.18 75 / .1)', color: T.yl }}>{r.sizeA}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingA.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'oklch(0.78 0.18 75 / .1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
                <div style={{ background: T.s3, borderRadius: 6, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: T.mono, color: T.gr }}>{r.itemB.batch_number}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'oklch(0.78 0.18 75 / .1)', color: T.yl }}>{r.sizeB}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {r.missingB.map((n: string) => <span key={n} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, background: isDupatta(n) ? 'rgba(96,165,250,.1)' : 'oklch(0.78 0.18 75 / .1)', color: isDupatta(n) ? T.bl : T.yl }}>{isDupatta(n) ? `${n} (no size)` : `${n} missing`}</span>)}
                  </div>
                </div>
              </div>
              <div style={{ background: 'oklch(0.78 0.18 75 / .05)', border: '1px solid oklch(0.78 0.18 75 / .15)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: T.yl, display: 'flex', alignItems: 'center', gap: 6 }}>
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
      </div></div>, document.body)}
      </>}
      <ConfirmModal {...confirmModalProps} />
      {exportPdfHtml && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: T.bg, display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.bd2}`, background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.sora }}>Export Preview</span>
            <button onClick={() => setExportPdfHtml(null)} style={S.btnIcon} title="Close" aria-label="Close">&times;</button>
          </div>
          <iframe srcDoc={exportPdfHtml} style={{ flex: 1, border: 'none', width: '100%', background: T.bg }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setExportPdfHtml(null)} style={{ padding: '10px 24px', borderRadius: 8, border: `1px solid ${T.bd2}`, background: T.glass2, color: T.tx2, fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 160 }}>Close</button>
            <button onClick={() => printOrQueue('document', exportPdfHtml!, 'A4', 'Inventory Export', undefined, addToast)} style={{ ...S.btnPrimary, ...S.btnLg, flex: 1, maxWidth: 160 }}>Print / Share</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}



