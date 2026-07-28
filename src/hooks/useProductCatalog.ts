// The SKU catalog behind every autosuggest box in the app.
//
// Loaded ONCE per page session and shared: ~1,280 rows of seven short fields is
// roughly 100 KB, so fetching it per input box (a challan can have a dozen)
// would be pure waste. The module-level promise means ten <SkuInput>s mounting
// together trigger one request, not ten.
//
// Sourced from `product_catalog`, which master-sync rebuilds from the master
// sheet - not from master_sheet_rows directly, which is admin/manager-only and
// carries every column of the sheet rather than the seven billing needs.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Product {
  sku: string;
  sku_norm: string;
  title: string | null;
  catalog: string | null;
  category: string | null;
  size: string | null;
  price_exc_gst: number | null;
  price_inc_gst: number | null;
  is_active: boolean;
}

let cache: Product[] | null = null;
let inflight: Promise<Product[]> | null = null;

const load = async (): Promise<Product[]> => {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    // Spelled-out columns, never select('*') — house rule, and it keeps the
    // payload to what the suggestion list actually renders.
    const { data, error } = await supabase
      .from('product_catalog')
      .select('sku, sku_norm, title, catalog, category, size, price_exc_gst, price_inc_gst, is_active')
      .order('is_active', { ascending: false })
      .order('sku_norm')
      .limit(5000);
    if (error) { inflight = null; throw error; }
    cache = (data || []) as Product[];
    inflight = null;
    return cache;
  })();
  return inflight;
};

/** Drop the cache so the next mount refetches — after a sheet edit, say. */
export const invalidateProductCatalog = () => { cache = null; inflight = null; };

export function useProductCatalog() {
  const [products, setProducts] = useState<Product[]>(cache || []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (cache) return;
    let alive = true;
    load()
      .then(p => { if (alive) { setProducts(p); setLoading(false); } })
      // A dead catalog must not break the form it sits in: the input stays
      // usable as plain text, and the reason is surfaced rather than swallowed.
      .catch(e => { if (alive) { setError(e?.message || 'Could not load the SKU list'); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  return { products, loading, error };
}

/** Exact lookup for a typed SKU. Case- and space-insensitive. */
export const findProduct = (products: Product[], raw: string): Product | undefined => {
  const key = raw.trim().toUpperCase();
  if (!key) return undefined;
  return products.find(p => p.sku_norm === key);
};

/**
 * Suggestions for what has been typed so far.
 * Prefix matches rank above "contains" (typing 710 wants 7101, not X-710-Y),
 * and active designs above discontinued ones.
 */
export const searchProducts = (products: Product[], raw: string, limit = 50): Product[] => {
  const q = raw.trim().toUpperCase();
  if (!q) return products.slice(0, limit);
  const scored: { p: Product; rank: number }[] = [];
  for (const p of products) {
    const inSku = p.sku_norm.indexOf(q);
    const inTitle = (p.title || '').toUpperCase().indexOf(q);
    if (inSku < 0 && inTitle < 0) continue;
    const rank = (inSku === 0 ? 0 : inSku > 0 ? 1 : 2) + (p.is_active ? 0 : 10);
    scored.push({ p, rank });
    if (scored.length > limit * 6) break;
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map(s => s.p);
};
