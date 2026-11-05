// Product Directory: every vendor product in one list (photo, vendor, cost,
// status, per-website chips), with search, filters, 25 per page, "Add product"
// and the product page. Spec: docs/playbook/product-directory-spec.md.
// V2 layout (layout-and-components.md §4 "List page"): header (Add product is
// the one gradient), a 12-wide toolbar tile, then cards 4+4+4 on desktop /
// glass rows on phone, then the pager.
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/friendlyError';
import { useBackClose } from '../../hooks/useBackClose';
import type { AddToast } from '../components/PbToasts';
import {
  EMPTY_FILTER, PAGE_SIZE, getPbSettingsLite, listProducts, listVendorsLite, listWebsitesLite,
  type ProductFilter, type ProductRow, type VendorLite, type WebsiteLite,
} from '../data/products';
import ProductFilters from '../components/product/ProductFilters';
import Pager from '../components/product/Pager';
import AddProductModal from '../components/product/AddProductModal';
import ProductResults from '../components/product/list/ProductResults';
import { PbButton, PbPageHeader } from '../components/ui';
import ProductPage from './ProductPage';
import { useReturnFocus } from '../hooks/useReturnFocus';

/** How the page opens (a dashboard tile passes a filter, "+ Add product" opens the form). */
export type ProductsStart = { status?: string; websiteId?: string; add?: boolean };

export default function Products({ addToast, start = {} }: { addToast: AddToast; start?: ProductsStart }) {
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
  const [adding, setAdding] = useState(!!start.add);
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);

  useBackClose(!!openId, () => setOpenId(null));
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
      setRows(r.rows); setCount(r.count); setLoadErr('');
    } catch (e) {
      if (my === seq.current) { addToast(friendlyError(e), 'error'); setLoadErr(friendlyError(e)); }
    } finally { if (my === seq.current) setLoading(false); }
  }, [filter, page, addToast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    Promise.all([listVendorsLite(), listWebsitesLite(), getPbSettingsLite()])
      .then(([v, w, s]) => { setVendors(v); setSites(w); setCategories(s.categories); })
      .catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  const onVendorCreated = (v: VendorLite) => setVendors(list => (list.some(x => x.id === v.id) ? list : [...list, v].sort((a, b) => a.name.localeCompare(b.name))));
  const filtered = !!(filter.search || filter.status || filter.vendorId || filter.websiteId);
  const add = () => setAdding(true);

  return (
    <>
      {openId && (
        <ProductPage id={openId} onClose={() => setOpenId(null)} onChanged={load} addToast={addToast}
          vendors={vendors} onVendorCreated={onVendorCreated} sites={sites} categories={categories} />
      )}
      <div style={{ display: openId ? 'none' : 'block' }}>
        <PbPageHeader title="Products" sub="Every vendor product, and where it is listed"
          actions={<PbButton kind="primary" icon="plus" onClick={add}>Add product</PbButton>}
          phoneAction={<PbButton kind="primary" iconOnly icon="plus" aria-label="Add product" onClick={add} />} />
        <div className="pb-bento pb-bento--auto">
          <ProductFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} vendors={vendors} websites={sites} onClear={clearAll} />
          <ProductResults rows={rows} sites={sites} loading={loading} loadErr={loadErr} filtered={filtered} search={filter.search}
            onOpen={setOpenId} onAdd={add} onClear={clearAll} onRetry={() => void load()} />
        </div>
        {rows.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />}
      </div>
      <AddProductModal open={adding} onClose={() => setAdding(false)} vendors={vendors} onVendorCreated={onVendorCreated}
        categories={categories} addToast={addToast}
        onSaved={id => { setAdding(false); void load(); setOpenId(id); }} />
    </>
  );
}
