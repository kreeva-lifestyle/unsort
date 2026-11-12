// Product Directory: every vendor product in one list (photo, vendor, cost,
// status, per-website chips), with search, filters, 25 per page, "Add product"
// and the product page. Spec: docs/playbook/product-directory-spec.md.
// V2 layout (layout-and-components.md §4 "List page"): header (Add product is
// the one gradient), on the Needs-info filter the "Let AI decide" bar, a 12-wide toolbar tile, then cards 4+4+4 on desktop /
// glass rows on phone, then the pager. "Import from website" (a secondary
// action; a glass row at the top on phone) opens ImportSheet; the newest
// import run shows as a tile above the toolbar while it runs or just finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import MissingTagsBar from '../components/product/list/MissingTagsBar';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import { heldLabels, listSources } from '../data/duplicates';
import { useBackClose } from '../../hooks/useBackClose';
import { useConfirm } from '../../components/ui/ConfirmModal';
import type { AddToast } from '../components/PbToasts';
import {
  EMPTY_FILTER, PAGE_SIZE, getPbSettingsLite, listProducts, listVendorsLite, listWebsitesLite,
  type ProductFilter, type ProductRow, type VendorLite, type WebsiteLite,
} from '../data/products';
import ProductFilters from '../components/product/ProductFilters';
import Pager from '../components/product/Pager';
import AddProductModal from '../components/product/AddProductModal';
import ProductResults from '../components/product/list/ProductResults';
import ImportSheet from '../components/product/import/ImportSheet';
import ImportRunTile from '../components/product/import/ImportRunTile';
import { PbButton, PbConfirm, PbPageHeader, PbRow } from '../components/ui';
import { useImportRun } from '../hooks/useImportRun';
import { discardAsk } from '../components/ui/discard';
import ProductPage from './ProductPage';
import { useReturnFocus } from '../hooks/useReturnFocus';
import { dirtyTitle } from '../hooks/useDirty';

/** How the page opens (a dashboard tile passes a filter, "+ Add product" opens the form). */
export type ProductsStart = { status?: string; websiteId?: string; add?: boolean };

export default function Products({ addToast, start = {}, onGuide }: { addToast: AddToast; start?: ProductsStart; onGuide?: (section: string) => void }) {
  const [filter, setFilterState] = useState<ProductFilter>({ ...EMPTY_FILTER, status: start.status ?? '', websiteId: start.websiteId ?? '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [sites, setSites] = useState<WebsiteLite[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sources, setSources] = useState<{ v: string; label: string }[]>([]);
  const [held, setHeld] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(!!start.add);
  const [importing, setImporting] = useState<{ open: boolean; url: string }>({ open: false, url: '' });
  const imp = useImportRun();
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);
  const [lookupErr, setLookupErr] = useState<unknown>(null);
  const { ask, modalProps } = useConfirm();

  // Leaving the product page (its Back button or the device Back) with edited,
  // unsaved Facts asks "Discard changes?" first; the nav asks in PlaybookApp.
  const leave = (force?: boolean): void | boolean => {
    const what = dirtyTitle();
    if (what && !force) { void ask(discardAsk(what)).then(ok => { if (ok) setOpenId(null); }); return false; }
    setOpenId(null);
  };
  // From one product straight to another (a match in "Already added?"): the same question about unsaved typing first.
  const openOther = (id: string) => {
    const what = dirtyTitle();
    if (what) void ask(discardAsk(what)).then(ok => { if (ok) setOpenId(id); }); else setOpenId(id);
  };
  useBackClose(!!openId, leave);
  useReturnFocus(openId);

  const setFilter = (p: Partial<ProductFilter>) => { setFilterState(f => ({ ...f, ...p })); setPage(0); };
  const clearAll = () => { setSearch(''); setFilterState(EMPTY_FILTER); setPage(0); };

  // Search waits for a pause in typing.
  useEffect(() => {
    if (filter.search === search) return;
    const t = setTimeout(() => { setFilterState(f => ({ ...f, search })); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search, filter.search]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await listProducts(filter, page);
      if (my !== seq.current) return;
      // Past the last page (its last product was archived, or left the filter) → step back to the real last page.
      const last = Math.max(0, Math.ceil(r.count / PAGE_SIZE) - 1);
      if (page > last) { setPage(last); return; }
      setRows(r.rows); setCount(r.count); setLoadErr('');
      // Which Needs-info rows look already added: a second, smaller read, so the list itself shows first.
      heldLabels(r.rows).then(h => { if (my === seq.current) setHeld(h); }).catch(e => logSwallowed('pb copies', e));
    } catch (e) {
      if (my !== seq.current) return;
      // The server answers "range not satisfiable" for a page past the end: same cure, from the first page.
      if (page > 0 && (e as { code?: string } | null)?.code === 'PGRST103') { setPage(0); return; }
      // The error shows in the results tile with Try again; a toast on top would only cover the header.
      setLoadErr(friendlyError(e));
    } finally { if (my === seq.current) setLoading(false); }
  }, [filter, page]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    Promise.all([listVendorsLite(), listWebsitesLite(), getPbSettingsLite(), listSources()])
      .then(([v, w, s, src]) => { setVendors(v); setSites(w); setCategories(s.categories); setSources(src); })
      .catch((e: unknown) => setLookupErr(e ?? new Error('Lookup failed')));
  }, []);
  // A failed lookup toasts only once the list has answered, and only if the list
  // itself loaded: when it failed too, its tile already says so with Try again.
  useEffect(() => {
    if (lookupErr == null || loading) return;
    if (!loadErr) addToast(friendlyError(lookupErr), 'error');
    setLookupErr(null);
  }, [lookupErr, loading, loadErr, addToast]);

  const onVendorCreated = (v: VendorLite) => setVendors(list => (list.some(x => x.id === v.id) ? list : [...list, v].sort((a, b) => a.name.localeCompare(b.name))));
  const filtered = !!(filter.search || filter.status || filter.vendorId || filter.websiteId || filter.source);
  const add = () => setAdding(true);
  const openImport = (url = '') => setImporting({ open: true, url });
  // The products arrive while the run goes; the list refreshes once when it finishes.
  const runDone = imp.run?.status === 'done';
  useEffect(() => { if (runDone) void load(); }, [runDone, load]);

  return (
    <>
      {openId && (
        <ProductPage id={openId} onClose={() => leave()} onChanged={load} onOpenOther={openOther} onDeleted={() => { setOpenId(null); void load(); }} addToast={addToast}
          vendors={vendors} onVendorCreated={onVendorCreated} sites={sites} categories={categories} />
      )}
      <div style={{ display: openId ? 'none' : 'block' }}>
        <PbPageHeader title="Products" sub="Every vendor product, and where it is listed"
          actions={<><PbButton icon="globe" onClick={() => openImport()}>Import from website</PbButton><PbButton kind="primary" icon="plus" onClick={add}>Add product</PbButton></>}
          phoneAction={<PbButton kind="primary" iconOnly icon="plus" aria-label="Add product" onClick={add} />} />
        {imp.run && (
          <div style={{ marginBottom: 'var(--pb-pad-tile)' }}>
            <ImportRunTile run={imp.run} pollError={imp.error} onChanged={() => void imp.reload()} onDismiss={() => imp.dismiss(imp.run!.id)} onRetry={openImport} onShow={id => { setSearch(''); setFilter({ ...EMPTY_FILTER, vendorId: id }); }} addToast={addToast} />
          </div>
        )}
        {/* Phone: the header holds one action (+), so the import lives as a row at the top of the list. */}
        <div className="pb-phone-only" style={{ marginBottom: 12 }}>
          <PbRow icon="globe" title="Import from website" meta="Copy another store’s in-stock products" onClick={() => openImport()} />
        </div>
        {filter.status === 'needs_info' && <MissingTagsBar addToast={addToast} onQueued={() => void load()} />}
        <div className="pb-bento pb-bento--auto">
          <ProductFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} vendors={vendors} websites={sites} sources={sources} onClear={clearAll} />
          <ProductResults rows={rows} sites={sites} held={held} loading={loading} loadErr={loadErr} filtered={filtered} search={filter.search}
            onOpen={setOpenId} onAdd={add} onClear={clearAll} onRetry={() => void load()} />
        </div>
        {rows.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />}
      </div>
      <AddProductModal open={adding} onClose={() => setAdding(false)} vendors={vendors} onVendorCreated={onVendorCreated}
        categories={categories} addToast={addToast}
        onSaved={id => { setAdding(false); void load(); setOpenId(id); }} />
      <ImportSheet open={importing.open} initialUrl={importing.url} onClose={() => setImporting({ open: false, url: '' })} addToast={addToast} onGuide={onGuide} vendors={vendors.map(v => v.name)}
        onStarted={() => { setImporting({ open: false, url: '' }); void imp.reload(); }} />
      <PbConfirm {...modalProps} />
    </>
  );
}
