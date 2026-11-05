// The product list's results area, as bento children: skeletons on first
// load, a load error in the tile (with Try again), the two empties, or the
// rows — cards 3 per row on desktop (4 of 12), glass rows on phone. While a
// refresh runs the old results stay, dimmed to .6 (states-and-feedback §2).
import type { ProductRow, WebsiteLite } from '../../../data/products';
import { useIsPhone } from '../../../hooks/useIsPhone';
import ProductCard from '../ProductCard';
import ProductRowItem from './ProductRowItem';
import { FilteredEmpty, FirstRunEmpty, ListSkeleton, LoadError } from './ListStates';

export default function ProductResults({ rows, sites, loading, loadErr, filtered, search, onOpen, onAdd, onClear, onRetry }: {
  rows: ProductRow[]; sites: WebsiteLite[]; loading: boolean; loadErr: string; filtered: boolean; search: string;
  onOpen: (id: string) => void; onAdd: () => void; onClear: () => void; onRetry: () => void;
}) {
  const phone = useIsPhone();
  if (rows.length === 0) {
    if (loading) return <ListSkeleton phone={phone} />;
    if (loadErr) return <LoadError message={loadErr} onRetry={onRetry} />;
    return filtered ? <FilteredEmpty search={search} onClear={onClear} /> : <FirstRunEmpty onAdd={onAdd} />;
  }
  const dim = { opacity: loading ? 0.6 : 1, transition: 'opacity .3s ease' };
  return (
    <>
      {loadErr && !loading && <LoadError inline message={loadErr} onRetry={onRetry} />}
      {phone ? (
        <div className="pb-span-12" aria-busy={loading || undefined} style={{ display: 'flex', flexDirection: 'column', gap: 8, ...dim }}>
          {rows.map(p => <ProductRowItem key={p.id} p={p} onOpen={() => onOpen(p.id)} />)}
        </div>
      ) : rows.map(p => (
        <div key={p.id} className="pb-span-4" style={{ ...dim, minWidth: 0 }}>
          <ProductCard p={p} sites={sites} onOpen={() => onOpen(p.id)} />
        </div>
      ))}
    </>
  );
}
