// "Back in stock from a new broadcast" (owner, 2026-11-12: "after 7 days we got
// a broadcast of that product … then that product is back in stock").
// Pre-launch fix D17: this only cleared a "temporarily out" note, and only when
// the Ready gate held the new post as a copy — a product marked plainly out of
// stock stayed sold out, and a design known by a number alone ("D no 5081")
// never took the step, because a bare number never holds a copy.
// When a vendor's Telegram post is read for the FIRST time and it is a product
// (the reader saw no stock notice in it), the products it means are the
// vendor's EARLIER products of the same design in the same colour, found the
// way a stock notice finds them (pb_stock_candidates: the design NUMBER at this
// vendor) — so what a notice switched off, a re-post switches on. Nothing is
// guessed: a number that two letter codes share, or a post without a colour
// when the design has several, brings nothing back.
// For each of them: out of stock → in stock again, and the stores are sent the
// change (stock.ts); a "temporarily out" note → the note goes, unless a LATER
// post left it. A product that is archived or permanently out is left alone:
// the new post is its own product.
// The later word wins, whichever post was read first (a failed read is tried
// again minutes later): every change carries the time the vendor MADE the post
// and the database refuses it when a newer word about that product's stock is
// on record (pb_stock_save, 20261113130000). The post also stamps its own time
// on itself and on the products it finds in stock, so an older notice that is
// read afterwards leaves them alone. A post that arrived without the vendor's
// time (an old crawler) brings nothing back and stamps nothing: its place in
// the order is not known, and a stock-out must not lose to a guess.
// A post that matched a sold-out product is that product posted again, so it
// must not become a second listing: when the gate does not hold it already (a
// number alone never holds by itself) the pair is remembered as "same" and the
// gate is re-applied — BEFORE any stock is touched. It then waits in Needs
// info as "Already here as …" for one tap, like every held copy, with a note
// saying what it brought back, or that a newer stock-out stands. A re-post of
// a product that is IN stock stays a suggestion, as before. Never fails a read.
import { enc, one, patch, rpc, sel } from './db.ts';
import { plain } from './http.ts';
import { NEWER, saidAt, saveStock } from './stock.ts';
import { type Cand, LABEL, SAME } from './stockNotice.ts';
import { refresh } from './tagStore.ts';
import type { ProductRow } from './types.ts';

interface Target { id: string; name: string | null; sku: string | null; in_stock: boolean; temp_out_at: string | null }

/** Two colour keys that mean one colour: the same word, or a trade name and its plain colour, either way round. */
export const sameColour = (a: string, b: string) => a === b || (SAME[a] || []).includes(b) || (SAME[b] || []).includes(a);

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
  const cols = me.colour_keys || [];
  if (!cols.length) return set.length === 1 ? set : [];
  return set.filter(c => ((c.colour_keys || []).length ? (c.colour_keys || []).some(k => cols.some(x => sameColour(x, k))) : set.length === 1));
}

/** `first`: this is the product's first read and the reader saw no stock notice in it. Returns the product as it now
 *  stands (held as a copy when it matched a sold-out product). */
export async function backInStock(p: ProductRow, userId: string | null, first: boolean): Promise<ProductRow> {
  if (!first || p.source !== 'telegram' || !p.source_posted_at || (p.status !== 'ready' && p.status !== 'needs_info') || !p.vendor_id || !String(p.sku || '').trim()) return p;
  let out = p;
  try {
    const said = saidAt(p);
    const cands = await rpc<Cand[]>('pb_stock_candidates', { p_vendor: p.vendor_id, p_code: p.sku }) || [];
    const at = cands.findIndex(c => c.id === p.id);
    if (at < 0) return p;
    await rpc('pb_stock_save', { p_product: p.id, p_change: { said_at: said } }); // its own word about itself
    const ids = restockTargets(cands[at], cands.slice(0, at)).map(c => c.id);
    if (!ids.length) return p;
    const rows = await sel<Target>(`pb_products?id=in.(${ids.join(',')})&status=neq.archived&perm_out_at=is.null&select=id,name,sku,in_stock,temp_out_at&order=created_at.asc`);
    const act = rows.filter(t => !t.in_stock || (!!t.temp_out_at && Date.parse(t.temp_out_at) < Date.parse(said))); // a note from a later post stays
    for (const t of rows) if (!act.includes(t)) await rpc('pb_stock_save', { p_product: t.id, p_change: { said_at: said } }); // in stock: confirmed as of this post
    if (!act.length) return p;
    if (!(p.status === 'needs_info' && await rpc<string | null>('pb_dup_held', { p_id: p.id }))) {
      for (const t of act) await rpc('pb_dup_verdict_set', { p_a: p.id, p_b: t.id, p_verdict: 'same' });
      const fin = (await refresh([p.id]))[0];
      if (fin) out = { ...p, status: fin.status, missing_attrs: fin.missing };
    }
    const back: Target[] = [], stays: Target[] = [];
    for (const t of act) {
      // said in full, whatever the look-up above showed (a notice may have been read meanwhile)
      const res = await saveStock({ id: t.id }, { in_stock: true, temp_out_at: null, said_at: said }, { posted_again: p.id }, userId);
      if (res >= 0) back.push(t); else if (res === NEWER) stays.push(t);
    }
    const names = (l: Target[]) => l.map(t => t.sku || t.name || 'a product').join(', ');
    const notes = [back.length ? `This post brought back in stock: ${names(back)}` : '', stays.length ? `Not brought back, a newer stock-out stands: ${names(stays)}` : ''].filter(Boolean).map(n => n.slice(0, 300));
    if (notes.length) {
      const cur = await one<{ intake_notes: string[] | null }>(`pb_products?id=eq.${enc(p.id)}&select=intake_notes`);
      await patch('pb_products', `id=eq.${enc(p.id)}`, { intake_notes: [...new Set([...(cur?.intake_notes || []), ...notes])].slice(0, 20) });
    }
  } catch (e) { console.error(`pb-products back in stock ${p.id}: ${plain(e)}`); }
  return out;
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
