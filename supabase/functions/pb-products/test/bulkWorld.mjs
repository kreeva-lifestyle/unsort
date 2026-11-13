// Shared by bulkTags.test.mjs and bulkStock.test.mjs (not a test itself: the runner only takes *.test.mjs).
// A fake database for the bulk-change log, part 2: every call is kept with the bulk change it carried (the x-pb-bulk
// header the recording trigger reads), and `recorded` answers what the record of a run holds.
globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };

export const RUN = '11111111-2222-4333-8444-555555555555';
export const uid = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A fake database: each handler answers a call first (undefined → the next one, then the defaults). `calls`: every
 *  call, with the bulk change it carried. */
export function world(...on) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, u, body, run: headers['x-pb-bulk'] ?? null });
    for (const f of on) {
      const given = f(method, u, body);
      if (given instanceof Response) return given;
      if (given !== undefined) return new Response(JSON.stringify(given), { status: 200 });
    }
    if (method === 'HEAD') return head(0);
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (u.startsWith('/rest/v1/pb_bulk_runs') && method === 'POST') return new Response(JSON.stringify([{ id: RUN }]), { status: 201 });
    return new Response(JSON.stringify(method === 'PATCH' ? [{ id: 'x' }] : []), { status: 200 });
  };
  return calls;
}
export const head = (n) => new Response(null, { status: 200, headers: { 'content-range': `0-0/${n}` } });
/** What the recording holds for the run: its kind, how many products it reached, its rows of the tag lists. */
export const recorded = ({ kind, products = 0, rows = [] }) => (m, u) => {
  if (m === 'HEAD' && u.startsWith('/rest/v1/pb_bulk_items')) return head(products + rows.length);
  if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs?id=eq.') && u.includes('select=kind')) return [{ kind }];
  if (u === '/rest/v1/rpc/pb_bulk_products') return products;
  if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_items?')) return rows;
  return undefined;
};
export const opened = (calls) => calls.find(c => c.method === 'POST' && c.u.startsWith('/rest/v1/pb_bulk_runs'))?.body[0];
export const closed = (calls) => calls.find(c => c.method === 'PATCH' && c.u.startsWith('/rest/v1/pb_bulk_runs'))?.body;
export const dropped = (calls) => calls.some(c => c.method === 'DELETE' && c.u.startsWith('/rest/v1/pb_bulk_runs'));
export const rpcCall = (calls, fn) => calls.find(c => c.u === `/rest/v1/rpc/${fn}`);
export const link = (a, position) => ({ category: 'Lehenga', attribute_id: a, position });
export const row = (tbl, pk, before, after) => ({ tbl, pk, before, after });
/** A bulk change on record (`kind`) and the database's answer to taking it back (`res`); `items`: its rows, as the
 *  server reads them for the list counts. */
export const revertDb = (kind, res, items = []) => (m, u) => {
  if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_runs?id=eq.')) return [{ id: RUN, kind, label: 'x', status: 'done', website_id: null, created_at: new Date().toISOString(), details: {} }];
  if (u === '/rest/v1/rpc/pb_bulk_revert') return { ...res, kind, label: 'x' };
  if (m === 'GET' && u.startsWith('/rest/v1/pb_bulk_items?')) return items;
  return undefined;
};
