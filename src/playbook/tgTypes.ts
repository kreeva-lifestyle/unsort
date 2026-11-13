// Playbook · Telegram intake types (20261107090000_pb_telegram_intake.sql and
// later). Re-exported from ./types, where the rest of Playbook imports them.
export type PbTgMessageKind = 'photo' | 'video' | 'text' | 'other';
export type PbTgMessageState = 'pending' | 'used' | 'ignored' | 'failed';

/** One forwarded message in the admin group, until it becomes (part of) a product. Staff read only. */
export interface PbTgMessage {
  id: number; update_id: number | null; chat_id: number; message_id: number;
  origin_chat_id: number | null; origin_title: string | null; origin_username: string | null; origin_message_id: number | null;
  media_group_id: string | null; kind: PbTgMessageKind | null; text: string | null;
  file_id: string | null; file_unique_id: string | null; file_size: number | null; mime: string | null;
  state: PbTgMessageState; product_id: string | null; note: string | null; received_at: string;
}

/** What the crawler last reported for one vendor channel. */
export interface PbTgChannel {
  username: string | null; channel_id: number | null; title: string | null; last_id: number | null; error: string | null;
  /** How many messages its last finished daily check copied (null: none reported yet). */
  sent?: number | null;
}

/** Single row (id = 1): bot, admin group and crawler status. Staff read; only pb-telegram writes. */
export interface PbTgConfig {
  bot_username: string | null;
  group_chat_id: number | null; group_title: string | null;
  link_code: string | null; link_code_expires_at: string | null; link_attempts: number;
  webhook_ok: boolean | null; webhook_error: string | null;
  crawler_seen_at: string | null; crawler_version: string | null; crawler_error: string | null;
  crawler_channels: PbTgChannel[];
  /** The overnight window the channels are checked in, IST minutes of day (may cross midnight; default 23:00–07:00). */
  crawl_window_start: number; crawl_window_end: number;
  last_message_at: string | null; updated_at: string;
  /** Is the bot in the admin group and able to read it? null: not checked yet. */
  group_ok: boolean | null; group_error: string | null; group_checked_at: string | null;
}
