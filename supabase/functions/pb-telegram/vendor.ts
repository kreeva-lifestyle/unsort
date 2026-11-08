// The vendor of a forwarded post comes from its channel: by channel id, then
// by username (the id is saved on that vendor), else a vendor is made from the
// channel (named after its title) with the Telegram ids saved. A vendor with
// the same name and no channel yet is linked instead of making a twin.
import { enc, insert, one, patch, sel } from '../pb-products/db.ts';
import { HttpError, plain } from '../pb-products/http.ts';

export interface Origin { chat: number; username: string | null; title: string | null }
interface V { id: string; name: string; tg_channel_id: number | null; tg_username: string | null; tg_title: string | null }
const COLS = 'id,name,tg_channel_id,tg_username,tg_title';

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120);

async function byId(chat: number) { return await one<V>(`pb_vendors?tg_channel_id=eq.${chat}&select=${COLS}`); }

async function byName(name: string): Promise<V | null> {
  // ilike treats * % _ as wildcards: confirm the match in code.
  const rows = await sel<V>(`pb_vendors?name=ilike.${enc(name)}&select=${COLS}&limit=50`);
  return rows.find(r => r.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function vendorFor(o: Origin): Promise<string> {
  const hit = await byId(o.chat);
  if (hit) {
    if (o.title && hit.tg_title !== o.title) await patch('pb_vendors', `id=eq.${enc(hit.id)}`, { tg_title: o.title })
      .catch((e) => console.error(`pb-telegram vendor ${hit.id} title: ${plain(e)}`));
    return hit.id;
  }
  if (o.username) {
    const u = await one<V>(`pb_vendors?tg_username=eq.${enc(o.username)}&select=${COLS}`);
    if (u) {
      if (u.tg_channel_id === null) {
        await patch('pb_vendors', `id=eq.${enc(u.id)}&tg_channel_id=is.null`, { tg_channel_id: o.chat, tg_title: o.title ?? u.tg_title })
          .catch((e) => console.error(`pb-telegram vendor ${u.id} channel id: ${plain(e)}`));
      }
      return u.id;
    }
  }
  const name = tidy(o.title || (o.username ? `@${o.username}` : '') || `Telegram channel ${o.chat}`);
  const row = { tg_channel_id: o.chat, tg_username: o.username, tg_title: o.title };
  try {
    return (await insert<{ id: string }>('pb_vendors', [{ name, notes: 'Added automatically from its Telegram channel.', ...row }]))[0].id;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 409)) throw e;
  }
  // Taken: another run just made it, or a vendor already has this name.
  const again = await byId(o.chat);
  if (again) return again.id;
  const same = await byName(name);
  if (same && same.tg_channel_id === null && (!o.username || !same.tg_username || same.tg_username === o.username)) {
    // Setting the username and the id together keeps the id (see pb_vendors_tg_reset).
    const r = await patch<{ id: string }>('pb_vendors', `id=eq.${enc(same.id)}&tg_channel_id=is.null`, { ...row, tg_username: same.tg_username ?? o.username });
    if (r.length) return same.id;
  }
  const alt = tidy(`${name} (${o.username ? `@${o.username}` : o.chat})`);
  return (await insert<{ id: string }>('pb_vendors', [{ name: alt, notes: 'Added automatically from its Telegram channel.', ...row }]))[0].id;
}
