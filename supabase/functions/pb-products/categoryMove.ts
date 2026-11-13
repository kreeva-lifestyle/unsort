// Categories: rename one, and move a category's products to another (owner, 13 Nov 2026: "If deleted than it has to be
// moved to correct category and let ai decide which product type is it for that category", "Im unable to rename the
// category even if there are no product linked to it"). Admin / manager (index.ts). SQL:
// 20261113220000_pb_category_rename_move.sql — one transaction each, the server only.
//   category_rename { from, to }          the list, its must-have tags, its products, the Product Type ticks and the
//                                         website rules take the new name. A bulk change when it reaches 2+ products;
//                                         its revert renames it back (categoryRevert.ts).
//   category_move   { from, to, remove? } every product filed under `from` (on the list or taken off it) is filed under
//                                         `to` and checked again — a bulk change whose revert files each product back
//                                         that is still in `to`. remove: `from` also leaves the list (categories_save,
//                                         its own bulk change). Then "Let AI decide" is queued for the moved products
//                                         that miss a must-have tag of `to` (Product Type…): the word rules first,
//                                         then the AI (tagFill.ts).
import type { Body } from './actions.ts';
import { asBulk } from './bulkLog.ts';
import { logActivity, one, rpc } from './db.ts';
import { HttpError } from './http.ts';
import type { Refreshed } from './tagStore.ts';
import { displayName, tagKey } from './tagText.ts';
import { categoriesSave } from './tagsBulk.ts';
import { tagsAiFill } from './tagsQueue.ts';

const name = (v: unknown) => displayName(v).slice(0, 60);
const same = (a: string, b: string) => tagKey(a) === tagKey(b);

export async function categoryRename(b: Body, userId: string | null) {
  const from = name(b.from), to = name(b.to);
  if (!from || !to) throw new HttpError(400, 'Give the category a name.');
  if (from === to) return { ok: true, renamed: 0, run_id: null };
  const r = await asBulk('category_rename', `Renamed the category ${from} to ${to}`, userId,
    async (run) => ({ renamed: Number(await rpc<number>('pb_category_rename', { p_from: from, p_to: to }, run)) || 0 }), () => ({ from, to }));
  await logActivity({ action: 'settings_edited', details: { key: 'categories', renamed: { from, to }, products: r.renamed, run_id: r.run_id }, user_id: userId });
  return { ok: true, renamed: r.renamed, run_id: r.run_id };
}

/** Products the move left waiting only for a tag the AI can choose (not for a category, and not chosen by a person —
 *  tags_ai_fill leaves those out itself). */
const toFill = (rows: Refreshed[]) => rows.filter(x => x.status === 'needs_info' && x.missing.some(m => m !== 'Category')).map(x => x.id);

export async function categoryMove(b: Body, userId: string | null) {
  const from = name(b.from), to = name(b.to);
  if (!from || !to) throw new HttpError(400, 'Say which category the products move from and to.');
  if (same(from, to)) throw new HttpError(400, 'Pick another category to move them to.');
  const r = await asBulk('category_move', `Moved the products of ${from} to ${to}`, userId,
    async (run) => ({ rows: (await rpc<Refreshed[]>('pb_category_move', { p_from: from, p_to: to }, run)) ?? [] }),
    (x) => ({ from, to, moved: x.rows.length }));
  let removed = false;
  if (b.remove === true) {
    const was = (await one<{ value: unknown }>('pb_settings?key=eq.categories&select=value'))?.value;
    const list = Array.isArray(was) ? was.map(String) : [];
    if (list.some(c => same(c, from))) { await categoriesSave({ categories: list.filter(c => !same(c, from)) }, userId); removed = true; }
  }
  const ids = toFill(r.rows);
  let queued = 0;
  for (let i = 0; i < ids.length; i += 500) queued += (await tagsAiFill({ product_ids: ids.slice(i, i + 500) }, userId)).queued ?? 0;
  const toReady = r.rows.filter(x => x.was !== 'ready' && x.status === 'ready').length;
  await logActivity({ action: 'settings_edited', details: { key: 'categories', moved: { from, to, products: r.rows.length, to_ready: toReady, queued, removed }, run_id: r.run_id }, user_id: userId });
  return { ok: true, moved: r.rows.length, to_ready: toReady, queued, removed, run_id: r.run_id };
}
