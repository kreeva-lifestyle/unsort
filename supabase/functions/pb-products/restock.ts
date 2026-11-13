// "Back in stock from a new broadcast" (owner, 2026-11-12: "after 7 days we got
// a broadcast of that product … then that product is back in stock").
// Pre-launch fix D17: this only cleared a "temporarily out" note, and only when
// the Ready gate held the new post as a copy — a product marked plainly out of
// stock stayed sold out, and a design known by a number alone ("D no 5081")
// never took the step, because a bare number never holds a copy.
// When a vendor's post is read for the FIRST time and it is a product (a stock
// notice never gets here), the products it means are:
//   * the product the gate holds it as a copy of (same vendor, same lettered
//     code, colours that agree or are unknown), and
//   * the vendor's EARLIER products of the same design, found the way a stock
//     notice finds them (pb_stock_candidates: the design NUMBER at this vendor),
//     in the same colour — so what a notice switched off, a re-post switches on.
// For each of them: out of stock → in stock again, and the stores are sent the
// change (stock.ts); a "temporarily out" note → the note goes. A product that
// is archived or permanently out is left alone: the new post is its own product.
// The later word wins, whichever post was read first: a product is not brought
// back when its stock-out is NEWER than this post (a notice that arrived after
// it, a person who switched the stock off after it).
// A post that brought a product back is that product posted again, so it must
// not become a second listing: when the gate does not hold it already, the pair
// is remembered as "same" and the gate is re-applied. It then waits in Needs
// info as "Already here as …" for one tap, like every held copy, with a note
// saying what it brought back. Never fails a read.
import { enc, logActivity, one, patch, rpc, sel } from './db.ts';
import { plain } from './http.ts';
import { saveStock } from './stock.ts';
import { type Cand, LABEL, SAME } from './stockNotice.ts';
import { refresh } from './tagStore.ts';
import type { ProductRow } from './types.ts';

interface Target { id: string; name: string | null; sku: string | null; in_stock: boolean; temp_out_at: string | null }

/** The vendor's earlier products a re-post means. `me` = the re-post's own row among the candidates, `earlier` = the
 *  rows before it (the candidates come oldest first). Nothing when the design is not certain: no code, the number
 *  under several letter codes, or several colours while the re-post names none. Unlike a notice (which has names
 *  written on a picture, "Pur"), a colour must match in full or by its trade name. */
export function restockTargets(me: Cand, earlier: Cand[]): Cand[] {
  const mine = earlier.filter(c => c.same_vendor), key = me.code_key || '';
  if (!key || !mine.length) return [];
  const set = LABEL.test(key) ? mine : mine.filter(c => c.code_key === key || LABEL.test(c.code_key || '#0'));
  // "D no 5081", "D-5081" and "5081" are one design; KB 5081 and NKB 5081 are two.
  if (new Set(set.map(c => (LABEL.test(c.code_key || '#0') ? '#' : c.code_key))).size !== 1) return [];
  const names = (me.colour_keys || []).flatMap(c => [c, ...(SAME[c] || [])]);
  if (!names.length) return set.length === 1 ? set : [];
  return set.filter(c => (c.colour_keys || []).length ? (c.colour_keys || []).some(k => names.includes(k)) : set.length === 1);
}

/** True when the product's last stock change is newer than this post: made by a notice that arrived after it, or by a person after it. */
async function newerWord(id: string, p: ProductRow): Promise<boolean> {
  const last = await one<{ created_at: string; details: { notice?: unknown } | null }>(`pb_activity?product_id=eq.${enc(id)}&action=eq.stock&select=created_at,details&order=created_at.desc&limit=1`);
  if (!last) return false;
  const notice = typeof last.details?.notice === 'string' ? await one<{ created_at: string }>(`pb_products?id=eq.${enc(last.details.notice)}&select=created_at`) : null;
  return Date.parse(notice?.created_at ?? last.created_at) > Date.parse(p.created_at);
}

/** `first`: this is the product's first read. Returns the product as it now stands (held as a copy when it brought one back). */
export async function backInStock(p: ProductRow, userId: string | null, first: boolean): Promise<ProductRow> {
  if (!first || p.source === 'import' || (p.status !== 'ready' && p.status !== 'needs_info')) return p;
  try {
    const held = p.status === 'needs_info' ? await rpc<string | null>('pb_dup_held', { p_id: p.id }) : null;
    const cands = p.vendor_id && String(p.sku || '').trim() ? await rpc<Cand[]>('pb_stock_candidates', { p_vendor: p.vendor_id, p_code: p.sku }) || [] : [];
    const at = cands.findIndex(c => c.id === p.id);
    const ids = [...new Set([...(held ? [held] : []), ...(at >= 0 ? restockTargets(cands[at], cands.slice(0, at)).map(c => c.id) : [])])];
    if (!ids.length) return p;
    const rows = await sel<Target>(`pb_products?id=in.(${ids.join(',')})&status=neq.archived&perm_out_at=is.null&select=id,name,sku,in_stock,temp_out_at&order=created_at.asc`);
    const back: Target[] = [];
    for (const t of rows) {
      if ((t.in_stock && !t.temp_out_at) || await newerWord(t.id, p)) continue;
      if (!t.in_stock) {
        if (await saveStock({ id: t.id }, { in_stock: true, temp_out_at: null }, { posted_again: p.id }, userId) < 0) continue;
      } else {
        if (!(await patch('pb_products', `id=eq.${enc(t.id)}&temp_out_at=not.is.null`, { temp_out_at: null })).length) continue;
        await logActivity({ product_id: t.id, action: 'stock', details: { temporary: false, posted_again: p.id }, user_id: userId });
      }
      back.push(t);
    }
    if (!back.length) return p;
    const cur = await one<{ intake_notes: string[] | null }>(`pb_products?id=eq.${enc(p.id)}&select=intake_notes`);
    const note = `This post brought back in stock: ${back.map(t => t.sku || t.name || 'a product').join(', ')}`.slice(0, 300);
    await patch('pb_products', `id=eq.${enc(p.id)}`, { intake_notes: [...new Set([...(cur?.intake_notes || []), note])].slice(0, 20) });
    if (held) return p;
    for (const t of back) await rpc('pb_dup_verdict_set', { p_a: p.id, p_b: t.id, p_verdict: 'same' });
    const fin = (await refresh([p.id]))[0];
    return fin ? { ...p, status: fin.status, missing_attrs: fin.missing } : p;
  } catch (e) {
    console.error(`pb-products back in stock ${p.id}: ${plain(e)}`);
    return p;
  }
}

/** Two posts of one product read in the same minute (pre-launch fix D21): the later one was judged before this one's
 *  code was saved, so it passed the gate. Now that this read is saved, the later posts that still stand as Ready are
 *  judged again and wait as copies. Never fails a read. */
export async function regateLater(p: ProductRow): Promise<void> {
  if (!String(p.sku || '').trim() || (p.status !== 'ready' && p.status !== 'needs_info')) return;
  try {
    const later = (await rpc<{ other_id: string; kind: string; other_status: string }[]>('pb_dup_matches', { p_ids: [p.id] }) || [])
      .filter(m => m.kind === 'original' && m.other_status === 'ready').map(m => m.other_id);
    if (later.length) await refresh([...new Set(later)]);
  } catch (e) { console.error(`pb-products copies after read ${p.id}: ${plain(e)}`); }
}

/** What a saved read means for the products around it (reader.ts). Returns the product as it now stands. */
export async function afterRead(p: ProductRow, userId: string | null, first: boolean): Promise<ProductRow> {
  const out = await backInStock(p, userId, first);
  await regateLater(out);
  return out;
}
