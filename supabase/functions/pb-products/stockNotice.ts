// A vendor's "stock out" notice (owner, 2026-11-12, with nine examples): a
// picture, often a collage, with the design codes written on it — "Permanent
// stock Out D no 5081", "D no 5073 Pur", "KB:-273 WINE", "7165 both colour",
// "Kb-302 Temporary stock out". It arrives like any post and would become a
// product; the AI reader (readerPrompt.ts) recognises it instead and hands the
// codes and colours here. For each code the vendor's own products with that
// design are found (pb_stock_candidates: the same code and colour rules as the
// "already added?" check) and marked out of stock (stock.ts saveStock, which
// sends the listings already on Shopify again → Sold out).
// Only what is certain is marked. Left for a person, with the reason:
//   * the number exists under several letter codes at this vendor;
//   * a colour the notice names that no product of the design has;
//   * a notice about a part of the product ("Only Lehenga");
//   * the code is only known at ANOTHER vendor (never acted on).
// A code Playbook has no product for is nothing to do. The notice itself never
// becomes a product: it is archived when everything was handled, or stays in
// Needs info named "Stock notice …" with one line per code under "Notes from
// Telegram" when something is left to check.
// Permanent or temporary (owner, same day: "If temporary word mentioned then
// ignore it. And just note that product as temporary which can be filterable;
// nothing is to be done"): a TEMPORARY notice changes nothing on the websites;
// the products only get the note `temp_out_at`, which the Products list can
// filter. A PERMANENT one, and one that says neither, marks them out of stock
// and clears that note.
// A product is only ever taken for a notice on its FIRST read, when nobody has
// typed anything into it and the reader found no price in it: a product that
// is already in use is never renamed or archived by a later read.
import { enc, logActivity, nowIso, patch, rpc } from './db.ts';
import { HttpError } from './http.ts';
import { saveStock } from './stock.ts';
import { PRODUCT_COLS, type ProductRow } from './types.ts';

export interface NoticeItem { code: string; colours: string[]; note: string }
export interface Notice { kind: 'permanent' | 'temporary' | 'unknown'; items: NoticeItem[] }
export interface Cand {
  id: string; name: string | null; sku: string | null; in_stock: boolean; status: string;
  code_key: string | null; colour_keys: string[] | null; same_vendor: boolean; notice_key: string | null;
}

/** A number with a label in front ("D no 5081", "D-5081", "code 5081"), not a lettered design code ("KB 273"). */
const LABEL = /^(?:#|D|DN|DNO|NO|CODE|DESIGN|DESIGNNO)\d/;
const letters = (s: string) => String(s || '').toLowerCase().replace(/[^a-z]+/g, '');
/** Trade names and the plain colour the reader gives the same shade (readerPrompt.ts COLOURS). */
const SAME: Record<string, string[]> = {
  rama: ['tealblue', 'ramagreen'], tealblue: ['rama'], parrot: ['parrotgreen', 'limegreen'], parrotgreen: ['parrot', 'limegreen'],
  offwhite: ['cream', 'ivory'], cream: ['offwhite'], rani: ['ranipink'], mehendi: ['mehendigreen'], navy: ['navyblue'], firozi: ['skyblue', 'turquoise'],
};

/** The products of `set` in the colour the notice names: an exact name wins; a looser one only when it points at one product. */
export function byColour(named: string, set: Cand[]): Cand[] {
  const n = letters(named);
  if (!n) return [];
  const names = [n, ...(SAME[n] || [])];
  const exact = set.filter(c => (c.colour_keys || []).some(k => names.includes(k)));
  if (exact.length) return exact;
  const near = set.filter(c => (c.colour_keys || []).some(k => k.length >= 3 && names.some(a => a.length >= 3 && (k.includes(a) || a.includes(k)))));
  return near.length === 1 ? near : [];
}

/** Which products one line of the notice means. `left` = why it is not fully handled ('' = it is, or there is nothing to do). */
export function pick(item: NoticeItem, cands: Cand[]): { apply: Cand[]; left: string } {
  const mine = cands.filter(c => c.same_vendor), others = cands.filter(c => !c.same_vendor);
  const skus = (l: Cand[]) => l.slice(0, 3).map(c => c.sku || c.name || 'a product').join(', ');
  if (!mine.length) return { apply: [], left: others.length ? `this code is only known at another vendor (${skus(others)})` : '' };
  if (String(item.note || '').trim()) return { apply: [], left: `it is about a part only ("${String(item.note).trim().slice(0, 60)}")` };
  const key = cands[0].notice_key || '';
  // A lettered code keeps its own letters (KB 25 is not NKB 25); a bare number takes the design only when one has it.
  const set = LABEL.test(key) ? mine : mine.filter(c => c.code_key === key || LABEL.test(c.code_key || '#0'));
  const designs = [...new Set(set.map(c => c.code_key || ''))];
  if (!set.length) return { apply: [], left: `this vendor has that number under other letters (${skus(mine)})` };
  if (designs.length > 1) return { apply: [], left: `several designs share this number (${designs.join(', ')})` };
  const colours = (item.colours || []).map(c => String(c || '').trim()).filter(Boolean);
  if (!colours.length) return { apply: set, left: '' };
  const apply = new Set<Cand>(), missing: string[] = [];
  for (const col of colours) { const hit = byColour(col, set); if (hit.length) hit.forEach(c => apply.add(c)); else missing.push(col); }
  return { apply: [...apply], left: missing.length ? `no product of this design in ${missing.join(', ')} (it has ${skus(set)})` : '' };
}

/** One line for the notice's "Notes from Telegram". `temporary`: the products were only noted, nothing was taken off sale. */
export function noticeLine(item: NoticeItem, r: { apply: Cand[]; left: string }, temporary = false): string {
  const label = `${item.code}${(item.colours || []).length ? ` ${item.colours.join(', ')}` : ''}`.replace(/\s+/g, ' ').trim();
  const done = r.apply.length ? `${temporary ? 'noted as temporarily out (still on sale)' : 'out of stock'}: ${r.apply.map(c => c.sku || c.name || 'a product').join(', ')}` : '';
  return `${label} — ${[done, r.left ? `CHECK: ${r.left}` : ''].filter(Boolean).join('. ') || 'not in Playbook, nothing to do'}`.slice(0, 300);
}

/** Handle a post the reader recognised as a stock notice. Returns the saved notice row, or null when it is an ordinary product.
 *  `price` = the cost the reader found (a post with a price is a product). */
export async function stockNotice(p: ProductRow, n: Notice | null | undefined, price: number | null, ai: { model: string; usd: number }, userId: string | null): Promise<ProductRow | null> {
  const items = (n?.items || []).filter(i => String(i?.code || '').trim()).slice(0, 40);
  if (!n || !items.length || p.source === 'import' || p.ai_read_at || (p.locked || []).length || Number(price) > 0) return null;
  const lines: string[] = [], temporary = n.kind === 'temporary';
  let marked = 0, left = 0;
  for (const it of items) {
    const r = pick(it, await rpc<Cand[]>('pb_stock_candidates', { p_vendor: p.vendor_id, p_code: it.code }) || []);
    for (const c of r.apply) {
      if (temporary) { // a note only: the product stays on sale, Shopify is not touched
        if (!(await patch('pb_products', `id=eq.${enc(c.id)}`, { temp_out_at: nowIso() })).length) continue;
        await logActivity({ product_id: c.id, action: 'stock', details: { temporary: true, notice: p.id }, user_id: userId });
        marked++;
      } else if (!c.in_stock) await patch('pb_products', `id=eq.${enc(c.id)}`, { temp_out_at: null }); // already out of stock: only the note goes
      else if ((await saveStock({ id: c.id, status: c.status }, { in_stock: false, temp_out_at: null }, { notice: p.id, kind: n.kind }, userId)) >= 0) marked++;
    }
    if (r.left) left++;
    lines.push(noticeLine(it, r, temporary));
  }
  const name = `Stock notice${n.kind === 'unknown' ? '' : ` (${n.kind})`}: ${items.map(i => `${i.code}${i.colours?.length ? ` ${i.colours.join(', ')}` : ''}`).join('; ')}`.replace(/\s+/g, ' ').slice(0, 200);
  const saved = await patch<ProductRow>('pb_products', `id=eq.${enc(p.id)}&status=eq.reading`,
    { name, status: left ? 'needs_info' : 'archived', intake_notes: lines.slice(0, 20), ai_read_at: nowIso(), ai_error: null, claimed_at: null }, PRODUCT_COLS);
  if (!saved[0]) throw new HttpError(409, 'The product changed while it was being read — open it again.');
  await logActivity({ product_id: p.id, action: 'read', details: { model: ai.model, usd: ai.usd, stock_notice: { kind: n.kind, items: items.length, marked, left } }, user_id: userId });
  return saved[0];
}
