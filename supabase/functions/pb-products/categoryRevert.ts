// Taking back a category rename or move (bulkRevert.ts hands these two kinds here: the database's pb_bulk_revert does
// not know them). The same refusals as every revert, in the same words: still running, already taken back, older than
// 7 days.
//   category_rename — renamed back (pb_category_rename), when the new name is still on the list and the old one free;
//                     otherwise the database says why.
//   category_move   — each product the move filed under `to` that is still there goes back to the category it had
//                     (one database call per old category, only where the product still holds `to`); one moved again
//                     or edited since is left and counted. Those products are checked again and their tags worked out
//                     again by the word rules; the AI's tags chosen after the move are their own bulk change
//                     ("Let AI decide"), taken back on their own.
import type { RunRow } from './bulkLog.ts';
import { enc, logActivity, patch, rpc, selAll } from './db.ts';
import { HttpError } from './http.ts';
import { refresh } from './tagStore.ts';
import { retagProducts } from './tagsProduct.ts';

export const CATEGORY_KINDS = ['category_move', 'category_rename'];
type Counts = Record<string, number>;
const DAY = 86_400_000;

function refuse(r: RunRow) {
  if (r.status === 'running') throw new HttpError(409, 'This is still running. Wait until it has finished.');
  if (r.status === 'reverted') throw new HttpError(409, 'This was already reverted.');
  if (Date.parse(r.created_at) < Date.now() - 7 * DAY) throw new HttpError(409, 'This is more than 7 days old, so it can no longer be reverted.');
}

interface Moved { id: string; from: string; to: string }
/** Each product the move changed, net: its category before the move and after it (a product's later rows in the same
 *  change — its status after the check — keep the first "before"). */
async function movedOf(runId: string): Promise<Moved[]> {
  const rows = await selAll<{ pk: { id?: string }; before: { category?: string | null } | null; after: { category?: string | null } | null }>(
    `pb_bulk_items?run_id=eq.${enc(runId)}&tbl=eq.pb_products&done=is.false&select=pk,before,after&order=id.asc`);
  const net = new Map<string, Moved>();
  for (const x of rows) {
    const id = String(x.pk?.id ?? ''), had = net.get(id);
    if (!id) continue;
    if (had) had.to = String(x.after?.category ?? '');
    else net.set(id, { id, from: String(x.before?.category ?? ''), to: String(x.after?.category ?? '') });
  }
  return [...net.values()].filter(m => m.from !== m.to);
}

/** Which of them can go back now: still in `to`, and nobody locked its category since. */
async function standing(moved: Moved[]): Promise<{ back: Moved[]; changed: number; gone: number }> {
  const now = new Map<string, { category: string | null; locked: string[] | null }>();
  for (let i = 0; i < moved.length; i += 200) {
    const ids = moved.slice(i, i + 200).map(m => enc(m.id)).join(',');
    for (const p of await selAll<{ id: string; category: string | null; locked: string[] | null }>(`pb_products?id=in.(${ids})&select=id,category,locked&order=id.asc`)) now.set(p.id, p);
  }
  const back: Moved[] = [];
  let changed = 0, gone = 0;
  for (const m of moved) {
    const p = now.get(m.id);
    if (!p) gone++;
    else if (p.category === m.to && !(p.locked || []).includes('category')) back.push(m);
    else changed++;
  }
  return { back, changed, gone };
}

export async function previewCategory(r: RunRow): Promise<Counts> {
  refuse(r);
  if (r.kind === 'category_rename') return { renamed: 1 };
  const s = await standing(await movedOf(r.id));
  return { restored: s.back.length, changed: s.changed, gone: s.gone };
}

export async function revertCategory(r: RunRow, userId: string | null): Promise<Counts> {
  refuse(r);
  let result: Counts;
  if (r.kind === 'category_rename') {
    const from = String(r.details?.from ?? ''), to = String(r.details?.to ?? '');
    if (!from || !to) throw new HttpError(409, 'This rename does not say which names it changed, so it cannot be reverted.');
    result = { renamed: 1, products: Number(await rpc<number>('pb_category_rename', { p_from: to, p_to: from })) || 0 };
  } else {
    const moved = await movedOf(r.id);
    const s = await standing(moved);
    const done: string[] = [];
    const groups = new Map<string, Moved[]>();
    for (const m of s.back) groups.set(`${m.from}\u0000${m.to}`, [...(groups.get(`${m.from}\u0000${m.to}`) ?? []), m]);
    for (const list of groups.values()) {
      for (let i = 0; i < list.length; i += 200) {
        const part = list.slice(i, i + 200);
        const ids = part.map(m => enc(m.id)).join(',');
        // Only where the product still holds what the move wrote: a change in between is left alone.
        const rows = await patch<{ id: string }>('pb_products', `id=in.(${ids})&category=eq.${enc(part[0].to)}`, { category: part[0].from || null });
        done.push(...rows.map(x => x.id));
      }
    }
    await refresh(done);
    for (let i = 0; i < done.length; i += 50) await retagProducts(done.slice(i, i + 50));
    if (moved.length) await rpc('pb_bulk_mark_done', { p_run: r.id, p_tbl: 'pb_products', p_ids: moved.map(m => m.id) });
    result = { restored: done.length, changed: s.changed + (s.back.length - done.length), gone: s.gone };
  }
  await rpc('pb_bulk_close', { p_run: r.id, p_user: userId, p_result: result, p_more: false });
  await logActivity({ action: 'bulk_reverted', details: { run_id: r.id, kind: r.kind, label: r.label, ...result }, user_id: userId });
  return result;
}
