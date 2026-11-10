// The SKU catalog behind every autosuggest box in the app.
//
// Loaded ONCE per page session and shared: a challan can hold a dozen SKU
// boxes, and fetching ~1,270 rows per box would be absurd. The module-level
// promise means ten <SkuInput>s mounting together trigger one request.
//
// SPEED: the index built here (`sorted` + `byKey`) is searched in
// productSearch.ts — see the note there.
//
// Results are cached on the DEVICE too (localStorage, validated by a
// fingerprint) so a repeat visit needs no round trip before the first
// keystroke works.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Product {
  sku: string;
  sku_norm: string;
  title: string | null;
  catalog: string | null;
  category: string | null;
  size: string | null;        // raw sheet value: "XS, S, M" or "SEMI-STITCHED"
  sizes: string[];            // parsed; EMPTY for semi-stitched / unstitched
  price_exc_gst: number | null;
  price_inc_gst: number | null;
  is_active: boolean;
  /** The sheet's INCLUDES, parsed: ['LEHENGA', 'BLOUSE', 'DUPATTA'] — a design's components. */
  includes: string[];
}

export interface Index { all: Product[]; sorted: Product[]; byKey: Map<string, Product> }

let cache: Index | null = null;
let inflight: Promise<Index> | null = null;

const buildIndex = (rows: Product[]): Index => {
  const all = rows.map(r => ({ ...r, sizes: r.sizes || [], includes: r.includes || [] }));
  const sorted = [...all].sort((a, b) => (a.sku_norm < b.sku_norm ? -1 : a.sku_norm > b.sku_norm ? 1 : 0));
  const byKey = new Map(all.map(p => [p.sku_norm, p]));
  return { all, sorted, byKey };
};

// PostgREST caps a response at 1000 rows on this project, and a client-side
// .limit() does NOT raise a server-side cap. The catalog is ~1,270 rows, so an
// unpaginated read silently returned the first 1000 and roughly 270 SKUs — the
// ones physically late in the table, like DRS230 — simply never appeared in
// any suggestion box. Paginate, exactly as master-sync's readAllRows does.
const PAGE = 1000;

// ── Device cache ────────────────────────────────────────────────────────────
// The catalog changes only when the Google sheet changes, which is rare, so
// refetching ~1,270 rows on every page load is waste. It is kept in
// localStorage and reused across sessions.
//
// The danger is staleness: a cached price that is quietly wrong is far worse
// than a slow load. So the cache is VALIDATED, never trusted. On load we show
// the cached rows immediately, then check a cheap fingerprint and refetch only
// if it moved (stale-while-revalidate).
//
// The version suffix is deliberate: bump it and every stale payload is
// ignored, so a column change cannot crash on an old shape. v2 added
// `includes`; the v1 copy is dropped so it does not sit in storage for good.
const CACHE_KEY = 'unsort.product_catalog.v2';
try { localStorage.removeItem('unsort.product_catalog.v1'); } catch { /* disabled storage */ }

// count + newest updated_at catches every real change. An edited row moves
// max(updated_at) — refresh_product_catalog() only touches rows that actually
// changed — and a deleted row moves the count.
const fingerprint = async (): Promise<string> => {
  const { data, count, error } = await supabase
    .from('product_catalog')
    .select('updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return `${count ?? 0}:${(data || [])[0]?.updated_at ?? ''}`;
};

// Every storage touch is guarded: private browsing, a full quota or a corrupt
// payload must degrade to a plain network fetch, never break the input box.
const readCache = (): { fp: string; rows: Product[] } | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.fp || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch { return null; }
};

const writeCache = (fp: string, rows: Product[]): void => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ fp, rows })); } catch { /* quota or disabled */ }
};

const fetchAll = async (): Promise<Product[]> => {
  const rows: Product[] = [];
  for (let from = 0; ; from += PAGE) {
    // Spelled-out columns, never select('*') — house rule, and it keeps the
    // payload to what the suggestion list actually renders.
    // The explicit .order() is load-bearing: without a stable sort, two
    // .range() windows can overlap or skip rows entirely.
    const { data, error } = await supabase
      .from('product_catalog')
      .select('sku, sku_norm, title, catalog, category, size, sizes, price_exc_gst, price_inc_gst, is_active, includes')
      .order('sku_norm')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data || []) as Product[];
    rows.push(...page);
    if (page.length < PAGE) break;
    // Backstop against an unbounded loop if the cap ever changes.
    if (rows.length >= 50_000) break;
  }
  return rows;
};

const load = async (): Promise<Index> => {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cached = readCache();
      // Seed from disk first so suggestions work on the very first keystroke,
      // then confirm freshness. If the fingerprint call fails (offline), the
      // cached rows still stand rather than leaving the box empty.
      //
      // The fingerprint is captured BEFORE fetchAll, not after: the catalog
      // refresh runs every 2 minutes, and stamping rows with a fingerprint
      // taken after the fetch could pair a post-refresh fingerprint with
      // pre-refresh rows — which then validate as "fresh" on every later
      // load, serving stale prices forever. Taken before, a mid-fetch
      // refresh just means one extra refetch on the next load. (Same reason
      // an ETag is issued with the body it describes, not after it.)
      if (cached) {
        cache = buildIndex(cached.rows);
        try {
          const fp = await fingerprint();
          if (fp !== cached.fp) {
            const rows = await fetchAll();
            cache = buildIndex(rows);
            writeCache(fp, rows);
          }
        } catch { /* keep the cached index */ }
        return cache;
      }
      let fp: string | null = null;
      try { fp = await fingerprint(); } catch { /* cache write skipped below */ }
      const rows = await fetchAll();
      cache = buildIndex(rows);
      if (fp !== null) writeCache(fp, rows);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

/** Drop the in-memory index and the device copy so the next mount refetches
 *  — used by the Vendor Studio "Refresh" right after a master sync, when
 *  the fingerprint may not have moved yet but the owner wants the new rows. */
export const refreshProductCatalog = (): void => {
  cache = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* disabled storage */ }
};

// Every mounted SKU box, so one "Refresh list" tap updates all of them.
const listeners = new Set<(i: Index) => void>();

/** Re-check the catalog now and hand the result to every mounted box. Light:
 *  the device copy is kept, so this is one tiny fingerprint query, plus a full
 *  read only when the server's list really moved. */
export const reloadProductCatalog = async (): Promise<Index> => {
  cache = null;
  const i = await load();
  listeners.forEach(fn => fn(i));
  return i;
};

export function useProductCatalog() {
  const [index, setIndex] = useState<Index | null>(cache);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const fn = (i: Index) => { if (alive) { setIndex(i); setError(''); } };
    listeners.add(fn);
    if (cache) setIndex(cache);
    else load()
      .then(fn)
      // A dead catalog must never break the form it sits in: the box stays
      // usable as plain text and the reason is surfaced, not swallowed.
      .catch(e => { if (alive) setError(e?.message || 'Could not load the SKU list'); });
    return () => { alive = false; listeners.delete(fn); };
  }, []);

  return { index, loading: !index && !error, error };
}

export { needsSize, variantSku, resolveSku, searchProducts } from './productSearch';
