// pb_vendors: who supplies the products (split out of types.ts, which re-exports it).
// Migrations: 20261105090000_pb_product_directory.sql, 20261107090000_pb_telegram_intake.sql,
// 20261113010000_pb_vendor_short_names.sql.
export interface PbVendor {
  id: string; name: string; notes: string | null; active: boolean;
  /** Short names: the letters this vendor's design codes start with (["KB", "NKB"]). `code` is the same list joined
   *  for showing and searching ("KB, NKB"), kept by the database (20261113010000_pb_vendor_short_names.sql): write `codes`. */
  codes: string[]; code: string | null;
  /** Telegram channel (20261107090000_pb_telegram_intake.sql): Bot API id (-100…), username (lowercase, no @), title. */
  tg_channel_id: number | null; tg_username: string | null; tg_title: string | null;
  /** Daily check (set by the database, never by the app): IST minute of day 0–1439, when it was given
   *  (first check = its next occurrence after that), when the last check finished, and whether the
   *  crawler has noted the channel's newest post yet (old posts are never copied). */
  tg_slot_minute: number | null; tg_slot_set_at: string | null; tg_checked_at: string | null; tg_cursor_ready: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}
