// Playbook database types (Product Directory, owner 2026-11-04).
// Mirrors supabase/migrations/20261105090000_pb_product_directory.sql.
// Contract for the shapes inside the jsonb columns: docs/playbook/product-directory-spec.md

export type PbProductStatus = 'new' | 'reading' | 'needs_info' | 'ready' | 'archived';
export type PbListingStatus = 'queued' | 'generating' | 'review' | 'publishing' | 'published' | 'failed' | 'skipped';
export type PbPublishMode = 'live' | 'draft' | 'review';
export type PbAuthMode = 'token' | 'client_credentials';
export type PbRounding = 'none' | 'nearest_10' | 'end_99' | 'end_49_99';
export type PbTagCase = 'as_is' | 'lower' | 'title';
export type PbModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5';
export type PbEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface PbVendor {
  id: string; name: string; code: string | null; notes: string | null; active: boolean;
  /** Telegram channel (20261107090000_pb_telegram_intake.sql): Bot API id (-100…), username (lowercase, no @), title. */
  tg_channel_id: number | null; tg_username: string | null; tg_title: string | null;
  /** Daily check (set by a trigger, never by the app): IST minute of day 0–1439, when the last check finished,
   *  and whether the crawler has noted the channel's newest post yet (old posts are never copied). */
  tg_slot_minute: number | null; tg_checked_at: string | null; tg_cursor_ready: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface PbProduct {
  id: string; vendor_id: string | null; source: 'manual' | 'telegram' | 'import'; source_ref: string | null;
  raw_text: string | null; sku: string | null; name: string | null; category: string | null;
  fabric: string | null; color: string | null; sizes: string[]; cost_price: number | null;
  /** Anything else the AI read: work, occasion, pattern, set_contents, wash_care, notes… (string values). */
  attributes: Record<string, string>;
  status: PbProductStatus;
  /** Fields staff edited by hand — the AI reader never overwrites these. */
  locked: string[];
  ai_read_at: string | null; ai_error: string | null; claimed_at: string | null;
  /** The vendor's separate "200 Less" message: cost = RATE − less (₹). */
  less_amount: number | null;
  /** https://t.me/<channel>/<message id> when the channel is public. */
  source_url: string | null;
  /** Notes from the Telegram intake ("No description arrived…", big videos). */
  intake_notes: string[];
  created_by: string | null; created_at: string; updated_at: string;
}

export type PbMediaKind = 'image' | 'video';
/** Photos and (Telegram) videos. Shopify and the AI only ever use kind 'image'. */
export interface PbProductImage { id: string; product_id: string; path: string; position: number; kind: PbMediaKind; bytes: number | null; created_at: string }

export interface PbPricing {
  /** % added to the vendor cost (100 = double). */
  markup_pct: number;
  /** ₹ added after the markup (shipping, packing…). */
  add_flat: number;
  rounding: PbRounding;
  /** 0 = no compare-at price; 30 = show a "was" price 30% above the price. */
  compare_at_pct: number;
  /** Never sell below this (₹), or null. */
  min_price: number | null;
}

export interface PbTagRules {
  /** Each template becomes one tag; placeholders: {category} {fabric} {color} {vendor} {vendor_code} {size} {sku} {attr:<key>}.
   *  A template with {size} gives one tag per size; a template whose placeholder is empty is dropped. */
  templates: string[];
  /** Added to every product on this site. */
  static: string[];
  case: PbTagCase;
  /** Let the AI add style/occasion tags too (at most ai_extra_max). */
  ai_extra: boolean;
  ai_extra_max: number;
}

export interface PbContent {
  model: PbModel; effort: PbEffort; language: string;
  /** How this website talks: "premium, elegant, festive" etc. */
  brand_voice: string;
  /** {ai_title} or a pattern of placeholders like "{color} {fabric} {category}". */
  title_template: string;
  title_max: number; description_words: number; meta_title_max: number; meta_desc_max: number;
  extra_instructions: string;
  /** Write image alt text for SEO. */
  alt_text: boolean;
}

export interface PbWebsite {
  id: string; name: string; shop_domain: string; auth_mode: PbAuthMode; api_version: string;
  /** Off until connected; off = nothing new is sent to this site. */
  active: boolean;
  publish_mode: PbPublishMode;
  /** When no rule matches: 'none' = do not list (safe default), 'all' = list everything. */
  routing_default: 'all' | 'none';
  track_inventory: boolean;
  pricing: PbPricing; tag_rules: PbTagRules; content: PbContent;
  connected_at: string | null; shop_name: string | null; last_error: string | null;
  created_at: string; updated_at: string;
}

export interface PbRuleConditions {
  vendor_ids?: string[]; categories?: string[]; fabrics?: string[];
  min_cost?: number | null; max_cost?: number | null;
  /** Any of these words in the name / SKU / details / attributes (case-insensitive). */
  keywords?: string[];
}

export interface PbRoutingRule {
  id: string; website_id: string; position: number; name: string; enabled: boolean;
  action: 'include' | 'exclude'; conditions: PbRuleConditions;
  /** Replaces the site's markup for products this rule includes. */
  price_override: { markup_pct?: number; add_flat?: number } | null;
  created_at: string; updated_at: string;
}

export interface PbListing {
  id: string; product_id: string; website_id: string; status: PbListingStatus; rule_id: string | null;
  price: number | null; compare_at_price: number | null;
  title: string | null; description_html: string | null; seo_title: string | null; seo_description: string | null;
  handle: string | null; tags: string[]; product_type: string | null; image_alts: string[];
  /** Fields staff edited — regenerate keeps them. Names: price, title, description_html, seo_title, seo_description, handle, tags. */
  locked: string[];
  ai_model: string | null; ai_effort: string | null; ai_cost_usd: number | null; generated_at: string | null;
  shopify_product_id: string | null; shopify_status: string | null; published_at: string | null;
  attempts: number; claimed_at: string | null; error: string | null; created_at: string; updated_at: string;
}

export interface PbActivity {
  id: number; product_id: string | null; website_id: string | null; listing_id: string | null;
  action: string; details: Record<string, unknown>; user_id: string | null; created_at: string;
}

export type PbSettings = {
  reader: { model: PbModel; effort: PbEffort };
  categories: string[];
  automation: { paused: boolean };
};

export const PB_MODELS: { id: PbModel; label: string; note: string }[] = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', note: 'Fast and cheapest — good for most listings' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', note: 'Better writing, ~20× Haiku cost' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', note: 'Best writing, highest cost' },
];
export const PB_EFFORTS: { id: PbEffort; label: string }[] = [
  { id: '', label: 'Model default' }, { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }, { id: 'xhigh', label: 'Extra high' }, { id: 'max', label: 'Max' },
];
export const PB_BUCKET = 'playbook-products';

// ── Telegram intake (20261107090000_pb_telegram_intake.sql) ──
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
export interface PbTgChannel { username: string | null; channel_id: number | null; title: string | null; last_id: number | null; error: string | null }

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
}
