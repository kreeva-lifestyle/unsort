// Before grouping: waiting messages vs the channel's messages already in
// products (straggle.ts) — a post forwarded twice is dropped, a photo / video
// that arrived late is copied onto the product it belongs to. Returns the ids
// handled here, which grouping must leave out.
import { enc, logActivity, patch, sel, selAll } from '../pb-products/db.ts';
import { TRIES, type MsgRow } from './create.ts';
import { copyMedia, onProduct, planMedia } from './media.ts';
import { stragglers, type Used } from './straggle.ts';

const WINDOW = 300; // channel message ids either side of the waiting ones

export async function adopt(rows: MsgRow[], token: string, deadline: number, tries: (r: MsgRow) => number) {
  const done = new Set<number>();
  let adopted = 0, dupes = 0;
  const byChat = new Map<number, MsgRow[]>();
  for (const r of rows) if (r.origin_chat_id !== null && r.origin_message_id !== null) byChat.set(r.origin_chat_id, [...(byChat.get(r.origin_chat_id) || []), r]);
  for (const [chat, list] of byChat) {
    const mids = list.map(r => r.origin_message_id as number);
    const used = await selAll<{ origin_message_id: number; media_group_id: string | null; product_id: string }>(
      `pb_tg_messages?origin_chat_id=eq.${chat}&state=eq.used&product_id=not.is.null&origin_message_id=gte.${Math.min(...mids) - WINDOW}`
      + `&origin_message_id=lte.${Math.max(...mids) + WINDOW}&select=origin_message_id,media_group_id,product_id&order=origin_message_id.asc,id.asc`);
    if (!used.length) continue;
    const u: Used[] = used.map(x => ({ mid: x.origin_message_id, album: x.media_group_id, product_id: x.product_id }));
    const r = stragglers(list.map(m => ({ id: m.id, mid: m.origin_message_id as number, kind: m.kind, album: m.media_group_id })), u);
    if (r.dupes.length) {
      await patch('pb_tg_messages', `id=in.(${r.dupes.join(',')})&state=in.(pending,failed)`, { state: 'ignored', note: 'The same channel post was forwarded again.' });
      r.dupes.forEach(id => done.add(id)); dupes += r.dupes.length;
    }
    for (const [id, productId] of r.adopt) {
      if (Date.now() > deadline - 30_000) break;
      const row = list.find(m => m.id === id) as MsgRow;
      const { next } = await onProduct(productId);
      const { files, notes } = planMedia([row], next);
      const copy = await copyMedia(token, productId, files, deadline);
      if (copy.timeout) continue; // next run
      if (copy.retry.length && tries(row) + 1 < TRIES) {
        await patch('pb_tg_messages', `id=eq.${id}`, { state: 'failed', note: `${copy.retry[0].slice(0, 200)} (attempt ${tries(row) + 1} of ${TRIES})` });
        done.add(id); continue;
      }
      const lost = copy.retry.length ? ['A late photo could not be copied from Telegram — add it by hand.'] : [];
      const extra = [...notes, ...copy.notes, ...lost];
      if (extra.length) {
        const p = await sel<{ intake_notes: string[] }>(`pb_products?id=eq.${enc(productId)}&select=intake_notes`);
        if (p[0]) await patch('pb_products', `id=eq.${enc(productId)}`, { intake_notes: [...new Set([...(p[0].intake_notes || []), ...extra])] });
      }
      await patch('pb_tg_messages', `id=eq.${id}`, { state: 'used', product_id: productId, note: null });
      if (copy.copied) await logActivity({ product_id: productId, action: 'telegram_late_media', details: { message: id } });
      done.add(id); adopted++;
    }
  }
  return { done, adopted, dupes };
}
