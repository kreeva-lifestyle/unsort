// PostgREST answers at most 1000 rows per request on this project and a
// client-side .limit() never raises that cap (see useProductCatalog), so a
// single .limit(5000) silently returned the first 1000 rows. Page in 1000s
// up to `max`, the way the catalog loader does; stop early on a short page.
const PAGE = 1000;
type Row = Record<string, any>;
export async function fetchPaged(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>, max: number): Promise<{ data: Row[]; error: unknown }> {
  const rows: Row[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const want = Math.min(PAGE, max - from);
    const { data, error } = await page(from, from + want - 1);
    if (error) return { data: rows, error };
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < want) break;
  }
  return { data: rows, error: null };
}
