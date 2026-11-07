// Pure: one Telegram update → what the webhook does with it. No I/O
// (unit-tested in test/parse.test.mjs).
//   link     "/link 123456" (or "/link@bot 123456") sent in a group
//   migrate  a group that became a supergroup (its chat id changes)
//   row      a FORWARDED message → one pb_tg_messages row. The origin comes
//            from forward_origin type 'channel' (or the legacy
//            forward_from_chat); forwarded from a person / group it is null
//            until the crawler's mapping (pb_tg_forwards) names the channel.
// Media: the largest photo size; a video; a document whose mime is image/* or
// video/* counts as photo / video; stickers, GIFs and other files are 'other'.

export interface TgRow {
  update_id: number | null; chat_id: number; message_id: number;
  origin_chat_id: number | null; origin_title: string | null; origin_username: string | null; origin_message_id: number | null;
  media_group_id: string | null; kind: 'photo' | 'video' | 'text' | 'other'; text: string | null;
  file_id: string | null; file_unique_id: string | null; file_size: number | null; mime: string | null;
}
export interface Parsed {
  chat_id?: number; chat_type?: string; chat_title?: string | null;
  link?: string; migrate?: { from: number; to: number }; row?: TgRow;
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Telegram JSON, read field by field below
type Any = any;
const str = (v: unknown, n = 4000) => (typeof v === 'string' && v ? v.slice(0, n) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const LINK = /^\/link(?:@\w+)?\s+(\d{6})\s*$/i;

function media(m: Any): Pick<TgRow, 'kind' | 'file_id' | 'file_unique_id' | 'file_size' | 'mime'> | null {
  if (Array.isArray(m.photo) && m.photo.length) {
    const big = [...m.photo].sort((a: Any, b: Any) => (num(b.file_size) ?? (b.width * b.height || 0)) - (num(a.file_size) ?? (a.width * a.height || 0)))[0];
    return { kind: 'photo', file_id: str(big.file_id, 300), file_unique_id: str(big.file_unique_id, 100), file_size: num(big.file_size), mime: 'image/jpeg' };
  }
  if (m.animation || m.sticker) return { kind: 'other', file_id: null, file_unique_id: null, file_size: null, mime: null };
  const v = m.video;
  if (v) return { kind: 'video', file_id: str(v.file_id, 300), file_unique_id: str(v.file_unique_id, 100), file_size: num(v.file_size), mime: str(v.mime_type, 100) };
  const d = m.document;
  if (d) {
    const mime = str(d.mime_type, 100) || '';
    const kind = /^image\//i.test(mime) ? 'photo' : /^video\//i.test(mime) ? 'video' : 'other';
    return { kind, file_id: kind === 'other' ? null : str(d.file_id, 300), file_unique_id: str(d.file_unique_id, 100), file_size: num(d.file_size), mime: mime || null };
  }
  return null;
}

export function parseUpdate(u: Any): Parsed {
  const m = u?.message;
  if (!m || typeof m !== 'object' || !m.chat) return {};
  const out: Parsed = { chat_id: num(m.chat.id) ?? undefined, chat_type: str(m.chat.type, 40) ?? undefined, chat_title: str(m.chat.title, 200) };
  if (out.chat_id === undefined) return {};
  const text = str(m.text, 20_000) ?? str(m.caption, 20_000);
  const group = out.chat_type === 'group' || out.chat_type === 'supergroup';
  const code = group && typeof m.text === 'string' ? LINK.exec(m.text.trim()) : null;
  if (code) return { ...out, link: code[1] };
  if (num(m.migrate_to_chat_id) !== null) return { ...out, migrate: { from: out.chat_id, to: m.migrate_to_chat_id } };
  if (num(m.migrate_from_chat_id) !== null) return { ...out, migrate: { from: m.migrate_from_chat_id, to: out.chat_id } };

  const fo = m.forward_origin;
  let origin: { id: number | null; title: string | null; username: string | null; mid: number | null } | null = null;
  if (fo && fo.type === 'channel' && fo.chat && num(fo.chat.id) !== null) {
    origin = { id: fo.chat.id, title: str(fo.chat.title, 200), username: str(fo.chat.username, 64), mid: num(fo.message_id) };
  } else if (m.forward_from_chat && m.forward_from_chat.type === 'channel' && num(m.forward_from_chat.id) !== null) {
    origin = { id: m.forward_from_chat.id, title: str(m.forward_from_chat.title, 200), username: str(m.forward_from_chat.username, 64), mid: num(m.forward_from_message_id) };
  } else if (fo || m.forward_from || m.forward_sender_name || m.forward_from_chat) {
    origin = { id: null, title: null, username: null, mid: null }; // a vendor's repost of a person's message
  }
  if (!origin || num(m.message_id) === null) return out;
  const med = media(m);
  return {
    ...out,
    row: {
      update_id: num(u.update_id), chat_id: out.chat_id, message_id: m.message_id,
      origin_chat_id: origin.id, origin_title: origin.title, origin_username: origin.username ? origin.username.toLowerCase() : null,
      origin_message_id: origin.mid, media_group_id: str(m.media_group_id, 100),
      kind: med ? med.kind : text ? 'text' : 'other', text,
      file_id: med?.file_id ?? null, file_unique_id: med?.file_unique_id ?? null, file_size: med?.file_size ?? null, mime: med?.mime ?? null,
    },
  };
}
