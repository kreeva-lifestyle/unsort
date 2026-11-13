// Shared by restock.test.mjs and stockOrder.test.mjs (not a test itself: the runner only takes *.test.mjs).
// The fixtures of "5081 at one vendor" and a fake database whose pb_stock_save keeps the rule of the real one
// (20261113130000_pb_stock_word.sql, checked against PostgreSQL in supabase/tests/sql/t_dups.sql part 7).
import assert from 'node:assert/strict';

globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };
const { NEWER } = await import('../stock.ts');

export const V = 'aaaaaaaa-0000-4000-8000-000000000001';
export const id = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const at = (day, hour = 6) => `2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
/** One candidate as pb_stock_candidates returns it (oldest first; the re-post itself is among them). */
export const cand = (n, sku, key, colours, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, status: 'ready', code_key: key, colour_keys: colours, same_vendor: !o.other, notice_key: o.nk ?? key });
/** The re-post as the reader has just saved it: made by the vendor on day 10 at 09:00. */
export const post = (n, sku, color, o = {}) => ({ id: id(n), vendor_id: V, source: 'telegram', sku, color, status: 'ready', created_at: at(10, 20), source_posted_at: at(10, 9), missing_attrs: [], ...o });
/** A stock notice as it arrives: made by the vendor on day 10 at `hour`. */
export const NOTICE = (hour, o = {}) => ({ id: id(50), vendor_id: V, source: 'telegram', status: 'reading', ai_read_at: null, locked: [], created_at: at(10, 20), source_posted_at: at(10, hour), ...o });

/** A fake database. w.rows: products (id, in_stock, temp_out_at, perm_out_at, status, stock_said_at, listings);
 *  w.cands: pb_stock_candidates' answer; w.held: pb_dup_held's. pb_stock_save keeps the rule of the real one
 *  (20261113130000_pb_stock_word.sql, checked against PostgreSQL in supabase/tests/sql/t_dups.sql part 7). */
export function world(w) {
  Object.assign(w, { saved: [], logged: [], verdicts: [], patched: [], refreshed: [], calls: [], rows: w.rows || [] });
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)).replace('https://sb.example', ''), method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    w.calls.push(`${method} ${u.split('?')[0]}`);
    if (w.down && u.includes(w.down)) return ok({ message: 'down' }, 500);
    if (u.startsWith('/rest/v1/rpc/pb_dup_held')) return ok(w.held ?? null);
    if (u.startsWith('/rest/v1/rpc/pb_stock_candidates')) return ok(w.cands || []);
    // w.gone: the vendor's products of this design that a word took off sale for good; only the ones newer than the post are answered
    if (u.startsWith('/rest/v1/rpc/pb_stock_gone')) return ok((w.gone || []).filter(g => Date.parse(g.said_at) > Date.parse(body.p_after)));
    if (u.startsWith('/rest/v1/rpc/pb_stock_save')) {
      const r = w.rows.find(x => x.id === body.p_product), ch = body.p_change;
      if (!r) return ok(-1);
      const T = (v) => (v ? Date.parse(v) : null), iso = (ms) => new Date(ms).toISOString();
      const said = T(ch.said_at), asof = said ?? T(ch.as_of), rec = T(r.stock_said_at), note = T(ch.temp_out_at), cur = T(r.temp_out_at);
      // refused when a newer word is on record; at the very same time a stock-out stands
      if (asof !== null && !ch.force && rec !== null && !(ch.in_stock === true ? rec < asof : rec <= asof)) return ok(NEWER);
      if (typeof ch.in_stock === 'boolean') r.in_stock = ch.in_stock;
      if ('temp_out_at' in ch) {
        r.temp_out_at = asof === null || ch.force ? ch.temp_out_at // no time given: as asked
          : note === null ? (cur !== null && cur >= asof ? r.temp_out_at : null) // a note from a later post stays
            : iso(Math.max(note, cur ?? note)); // an older note never replaces a newer one
      }
      if ('perm_out_at' in ch) r.perm_out_at = ch.perm_out_at;
      if ('said_at' in ch) r.stock_said_at = said === null ? null : iso(Math.max(said, rec ?? said)); // null: the time on record is forgotten
      w.saved.push({ id: body.p_product, ...ch });
      return ok('in_stock' in ch || 'perm_out_at' in ch ? (r.listings ?? 0) : 0);
    }
    if (u.startsWith('/rest/v1/rpc/pb_dup_verdict_set')) { w.verdicts.push(body); return new Response(null, { status: 204 }); } // a function that returns nothing
    if (u.startsWith('/rest/v1/rpc/pb_products_refresh')) { w.refreshed.push(...body.p_ids); return ok(body.p_ids.map(i => ({ id: i, status: 'needs_info', was: 'ready', missing: [] }))); }
    if (u.startsWith('/rest/v1/rpc/pb_dup_matches')) return ok(w.matches || []);
    if (u.startsWith('/rest/v1/pb_activity')) { w.logged.push(body[0]); return ok([{}], 201); }
    if (u.startsWith('/rest/v1/pb_listings')) return ok([]);
    if (u.startsWith('/rest/v1/pb_products?id=in.(') && method === 'GET') {
      const want = /id=in\.\(([^)]*)\)/.exec(u)[1].split(',');
      assert.match(u, /status=neq\.archived&perm_out_at=is\.null/, 'archived and permanently out products are never asked for');
      return ok(w.rows.filter(r => want.includes(r.id) && r.status !== 'archived' && !r.perm_out_at));
    }
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'GET') return ok(u.includes('select=intake_notes') ? [{ intake_notes: w.notes || [] }] : w.rows.filter(r => u.includes(r.id)));
    if (u.startsWith('/rest/v1/pb_products?id=eq.') && method === 'PATCH') {
      const pid = /id=eq\.([\w-]+)/.exec(u)[1], r = w.rows.find(x => x.id === pid);
      // "archive it once nothing of it is on sale" (stockSend.ts retire) only applies to a product that is permanently out
      if (u.includes('perm_out_at=not.is.null') && !(r && r.perm_out_at && !r.in_stock)) return ok([]);
      w.patched.push({ id: pid, body });
      if (r) Object.assign(r, body);
      return ok([{ id: pid }]);
    }
    return ok([]);
  };
  return w;
}
export const row = (n, sku, o = {}) => ({ id: id(n), name: null, sku, in_stock: true, temp_out_at: null, perm_out_at: null, status: 'ready', stock_said_at: null, created_at: at(1), ...o });
export const stockOf = (w, n) => w.rows.find(r => r.id === id(n)).in_stock;
export const C5081 = [cand(1, 'D no 5081', '#5081', ['pink']), cand(9, '5081', '#5081', ['pink'])];
