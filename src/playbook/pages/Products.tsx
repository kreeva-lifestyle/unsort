// Product Directory: every vendor product in one list (photo, vendor, cost,
// status, per-website chips), with search, filters, 25 per page, "Add product"
// and the product page. Spec: docs/playbook/product-directory-spec.md.
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { useBackClose } from '../../hooks/useBackClose';
import Empty from '../../components/ui/Empty';
import type { AddToast } from '../components/PbToasts';
import {
  EMPTY_FILTER, PAGE_SIZE, getPbSettingsLite, listProducts, listVendorsLite, listWebsitesLite,
  type ProductFilter, type ProductRow, type VendorLite, type WebsiteLite,
} from '../data/products';
import ProductFilters from '../components/product/ProductFilters';
import ProductCard from '../components/product/ProductCard';
import Pager from '../components/product/Pager';
import AddProductModal from '../components/product/AddProductModal';
import ProductPage from './ProductPage';

/** How the page opens (a dashboard tile passes a filter, "+ Add product" opens the form). */
export type ProductsStart = { status?: string; websiteId?: string; add?: boolean };

export default function Products({ addToast, start = {} }: { addToast: AddToast; start?: ProductsStart }) {
  const [filter, setFilterState] = useState<ProductFilter>({ ...EMPTY_FILTER, status: start.status ?? '', websiteId: start.websiteId ?? '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [sites, setSites] = useState<WebsiteLite[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [adding, setAdding] = useState(!!start.add);
  const [openId, setOpenId] = useState<string | null>(null);
  const seq = useRef(0);

  useBackClose(!!openId, () => setOpenId(null));

  const setFilter = (p: Partial<ProductFilter>) => { setFilterState(f => ({ ...f, ...p })); setPage(0); };

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
      setRows(r.rows); setCount(r.count);
    } catch (e) { if (my === seq.current) addToast(friendlyError(e), 'error'); }
    finally { if (my === seq.current) setLoading(false); }
  }, [filter, page, addToast]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    Promise.all([listVendorsLite(), listWebsitesLite(), getPbSettingsLite()])
      .then(([v, w, s]) => { setVendors(v); setSites(w); setCategories(s.categories); })
      .catch(e => addToast(friendlyError(e), 'error'));
  }, [addToast]);

  const onVendorCreated = (v: VendorLite) => setVendors(list => (list.some(x => x.id === v.id) ? list : [...list, v].sort((a, b) => a.name.localeCompare(b.name))));
  const filtered = !!(filter.search || filter.status || filter.vendorId || filter.websiteId);

  return (
    <>
      {openId && (
        <ProductPage id={openId} onClose={() => setOpenId(null)} onChanged={load} addToast={addToast}
          vendors={vendors} onVendorCreated={onVendorCreated} sites={sites} categories={categories} />
      )}
      <div style={{ display: openId ? 'none' : 'block' }}>
        <div style={{ ...S.flexBetween, gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>Products</div>
            <div style={{ fontSize: 12, color: T.tx3, marginTop: 4 }}>Every vendor product, and where it is listed</div>
          </div>
          <button type="button" onClick={() => setAdding(true)} style={{ ...S.btnPrimary, minHeight: 44 }}>+ Add product</button>
        </div>
        <ProductFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} vendors={vendors} websites={sites} />
        {loading && rows.length === 0 ? (
          <div style={S.emptyState}>Loading…</div>
        ) : rows.length === 0 ? (
          filtered
            ? <Empty icon="search" title="No products match" message="Try another search, or clear the filters." cta="Clear filters" onCta={() => { setSearch(''); setFilterState(EMPTY_FILTER); setPage(0); }} />
            : <Empty icon="box" title="No products yet" message="Add a product by hand — Telegram posts will land here automatically once that is connected." cta="+ Add product" onCta={() => setAdding(true)} />
        ) : (
          <div style={{ opacity: loading ? 0.6 : 1, transition: T.transition }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
              {rows.map(p => <ProductCard key={p.id} p={p} sites={sites} onOpen={() => setOpenId(p.id)} />)}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </div>
        )}
      </div>
      <AddProductModal open={adding} onClose={() => setAdding(false)} vendors={vendors} onVendorCreated={onVendorCreated}
        categories={categories} addToast={addToast}
        onSaved={id => { setAdding(false); void load(); setOpenId(id); }} />
    </>
  );
}
