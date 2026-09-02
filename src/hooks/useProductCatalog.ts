// The SKU catalog behind every autosuggest box in the app.
//
// Loaded ONCE per page session and shared: a challan can hold a dozen SKU
// boxes, and fetching ~1,270 rows per box would be absurd. The module-level
// promise means ten <SkuInput>s mounting together trigger one request.
//
// SPEED. Search runs on every keystroke, so it is indexed rather than scanned:
//   * `sorted`  — array ordered by sku_norm, prefix-searched by binary search,
//                 so "DRS1" costs O(log n + k), not O(n).
//   * `byKey`   — Map for O(1) exact lookup; the old linear find ran on every
//                 single change event.
// At 1,270 rows a linear scan would also be fast; this is built so it stays
// fast at 50,000, which is the point of doing it properly once.
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
}

interface Index { all: Product[]; sorted: Product[]; byKey: Map<string, Product> }

let cache: Index | null = null;
let inflight: Promise<Index> | null = null;

const buildIndex = (rows: Product[]): Index => {
  const all = rows.map(r => ({ ...r, sizes: r.sizes || [] }));
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
// The v1 suffix is deliberate: bump it and every stale payload is ignored, so a
// future column change cannot crash on an old shape.
const CACHE_KEY = 'unsort.product_catalog.v1';

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
      .select('sku, sku_norm, title, catalog, category, size, sizes, price_exc_gst, price_inc_gst, is_active')
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


export function useProductCatalog() {
  const [index, setIndex] = useState<Index | null>(cache);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cache) { setIndex(cache); return; }
    let alive = true;
    load()
      .then(i => { if (alive) setIndex(i); })
      // A dead catalog must never break the form it sits in: the box stays
      // usable as plain text and the reason is surfaced, not swallowed.
      .catch(e => { if (alive) setError(e?.message || 'Could not load the SKU list'); });
    return () => { alive = false; };
  }, []);

  return { index, loading: !index && !error, error };
}

// ── Size rules ──────────────────────────────────────────────────────────────

/**
 * Does this design still need a size picked?
 *
 * No when `sizes` is empty — SEMI-STITCHED and UNSTITCHED are stitch types,
 * not sizes, and DRS141-SEMI-STITCHED would be nonsense.
 *
 * Also no when the SKU already ends in one of its own sizes: 78 SKUs in the
 * sheet are already written as DRS0004-S, and appending again would produce
 * DRS0004-S-S.
 */
export const needsSize = (p: Product): boolean =>
  p.sizes.length > 0 && !p.sizes.some(s => p.sku_norm.endsWith('-' + s));

/** Parent SKU + chosen size -> the sellable code, e.g. DRS141 + S -> DRS141-S. */
export const variantSku = (p: Product, size: string): string => `${p.sku}-${size}`;

// ── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Resolve typed text to a catalog design. Accepts either the parent (DRS141)
 * or an already-sized variant (DRS141-S), so a user who types the full code by
 * hand still gets the price.
 */
export const resolveSku = (
  index: Index | null, raw: string,
): { product: Product; size: string | null } | undefined => {
  if (!index) return undefined;
  const key = raw.trim().toUpperCase();
  if (!key) return undefined;
  const exact = index.byKey.get(key);
  if (exact) return { product: exact, size: null };
  // Try stripping a trailing "-SIZE" and matching the parent — but only if
  // that size genuinely belongs to the parent, so DRS141-XYZ stays unresolved.
  const dash = key.lastIndexOf('-');
  if (dash > 0) {
    const parent = index.byKey.get(key.slice(0, dash));
    const size = key.slice(dash + 1);
    if (parent && parent.sizes.includes(size)) return { product: parent, size };
  }
  return undefined;
};

// ── Search ──────────────────────────────────────────────────────────────────

/** First index whose sku_norm >= q. Standard lower bound. */
const lowerBound = (arr: Product[], q: string): number => {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].sku_norm < q) lo = mid + 1; else hi = mid;
  }
  return lo;
};

/**
 * Suggestions for what has been typed. Prefix matches (binary-searched) come
 * first; a title/substring scan only runs when the prefix hit too little,
 * so the common case never pays for it.
 *
 * Deliberately NOT memoised here. A module-level memo is a single cell shared
 * by every mounted SkuInput, so a challan with several rows would thrash it —
 * callers memoise per-instance with useMemo instead.
 */
export const searchProducts = (index: Index | null, raw: string, limit = 25): Product[] => {
  if (!index) return [];
  const q = raw.trim().toUpperCase();
  if (!q) return [];

  const out: Product[] = [];
  const seen = new Set<string>();

  // Prefix band: contiguous in a sorted array, so walk from the lower bound
  // until the prefix stops matching. Active designs first within the band.
  const start = lowerBound(index.sorted, q);
  const band: Product[] = [];
  for (let i = start; i < index.sorted.length && index.sorted[i].sku_norm.startsWith(q); i++) {
    band.push(index.sorted[i]);
    if (band.length >= limit * 4) break;
  }
  band.sort((a, b) => Number(b.is_active) - Number(a.is_active));
  for (const p of band) { if (out.length >= limit) break; out.push(p); seen.add(p.sku_norm); }

  // Only now, and only if the prefix was thin, pay for a scan.
  if (out.length < 5) {
    for (const p of index.all) {
      if (out.length >= limit) break;
      if (seen.has(p.sku_norm)) continue;
      if (p.sku_norm.includes(q) || (p.title || '').toUpperCase().includes(q)) {
        out.push(p); seen.add(p.sku_norm);
      }
    }
  }

  return out;
};
