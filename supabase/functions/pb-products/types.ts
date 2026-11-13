// Row shapes the pb-products edge function reads and writes. They mirror
// supabase/migrations/20261105090000_pb_product_directory.sql (+ …_pb_tags.sql: taxonomy, product values, missing_attrs) and the client's
// src/playbook/types.ts (kept separate: an edge function bundles only its own
// folder). jsonb shapes: docs/playbook/product-directory-spec.md.

export interface ProductRow {
  id: string; vendor_id: string | null; source: string; source_ref: string | null;
  raw_text: string | null; sku: string | null; name: string | null; category: string | null;
  fabric: string | null; color: string | null; sizes: string[]; cost_price: number | null; less_amount: number | null;
  /** false = out of stock: mirrored on Shopify as Sold out (productInput.ts). Set by the importer and by staff. */
  in_stock: boolean;
  /** When a vendor notice called it TEMPORARILY out of stock: a note only, nothing changes on Shopify (stockNotice.ts). */
  temp_out_at: string | null;
  /** When a vendor notice said PERMANENT stock out (stock.ts takeOffSale); it counts while in_stock is false: see permOut. */
  perm_out_at: string | null;
  /** Import from website: sell at exactly this price on every website (pricing rules skipped); price_note says where it came from. */
  sell_price: number | null; price_note: string | null;
  attributes: Record<string, string>; status: string; locked: string[];
  /** The chosen attribute values' names (a cache kept by pb_products_refresh); websites use the values through {tags}. */
  tags: string[];
  /** Required attributes of its category with no value yet ("Colour"); non-empty = Needs info. */
  missing_attrs: string[];
  ai_read_at: string | null; ai_error: string | null; claimed_at: string | null;
  /** When the vendor made the post (Telegram); null when not known. */
  source_posted_at?: string | null;
  created_at: string; updated_at: string;
}

export interface Pricing {
  markup_pct: number; add_flat: number; rounding: string; compare_at_pct: number; min_price: number | null;
}

export interface TagRules {
  templates: string[]; static: string[]; case: string; ai_extra: boolean; ai_extra_max: number;
  /** At most this many tags per listing, applied last (default MAX_SITE_TAGS; older rows lack it). */
  max_tags?: number;
  /** {tags} as plain value names (default) or `${prefix}_${name}` ('prefixed'). */
  tag_style?: 'plain' | 'prefixed';
  /** The only extra tags the AI may add (empty = any short style / occasion tag). */
  ai_allowed?: string[];
}
export const MAX_SITE_TAGS = 30;

/** What makes one store's listings its own (profile.ts fills the gaps). Every key is optional in older rows. */
export interface StoreProfile {
  brand_name: string; market: string; spelling: string; units: string; audience: string; angle: string;
  /** The search phrase each listing is written for: {color} {fabric} {category} {work} {occasion} {name}. */
  keyword_pattern: string;
  delivery: string; stitching: string; returns: string;
  /** Also put the two questions at the end of the description (they always go to the custom field). */
  faq_in_description: boolean;
  /** Send fabric / work / colour / occasion / set contents and the FAQ to Shopify as custom fields. */
  custom_fields: boolean;
}

export interface ContentCfg {
  model: string; effort: string; language: string; brand_voice: string; title_template: string;
  title_max: number; description_words: number; meta_title_max: number; meta_desc_max: number;
  extra_instructions: string; alt_text: boolean;
  /** How the AI should build its title, in words ("Colour, fabric, type, then the work"). */
  title_formula?: string;
  profile?: Partial<StoreProfile>;
}

export interface WebsiteRow {
  id: string; name: string; shop_domain: string; auth_mode: string; api_version: string; active: boolean;
  publish_mode: string; routing_default: string; track_inventory: boolean;
  pricing: Pricing; tag_rules: TagRules; content: ContentCfg;
  connected_at: string | null; shop_name: string | null; last_error: string | null;
}

export interface RuleConditions {
  vendor_ids?: string[]; categories?: string[]; fabrics?: string[];
  min_cost?: number | null; max_cost?: number | null; keywords?: string[];
}

export interface RuleRow {
  id: string; website_id: string; position: number; name: string; enabled: boolean;
  action: string; conditions: RuleConditions;
  price_override: { markup_pct?: number; add_flat?: number } | null;
}

export interface ListingRow {
  id: string; product_id: string; website_id: string; status: string; rule_id: string | null;
  price: number | null; compare_at_price: number | null; title: string | null; description_html: string | null;
  seo_title: string | null; seo_description: string | null; handle: string | null; tags: string[];
  product_type: string | null; image_alts: string[]; locked: string[];
  ai_model: string | null; ai_effort: string | null; ai_cost_usd: number | null; generated_at: string | null;
  shopify_product_id: string | null; shopify_status: string | null; published_at: string | null;
  /** The day it first went live on this store. published_at moves on every re-send; this one never does. */
  first_published_at: string | null;
  /** The colour part its sizes' codes were first sent to the store with ('' = none, null = not sent yet): productInput.ts. */
  sku_colour?: string | null;
  attempts: number; claimed_at: string | null; error: string | null; created_at: string; updated_at: string;
}

export interface SecretsRow {
  access_token: string | null; client_id: string | null; client_secret: string | null;
  token_expires_at: string | null; online_store_publication_id: string | null;
}

export interface Settings {
  reader: { model: string; effort: string };
  categories: string[];
  /** daily_limit_inr: the AI's spend per day (IST) in rupees after which the worker stops reading and writing; 0 = no limit. */
  automation: { paused: boolean; daily_limit_inr: number };
}


/** Who is calling: the cron / Telegram bridge (shared secret) or a signed-in staff member. */
export type Caller = { kind: 'secret' } | { kind: 'staff'; id: string; role: string };

/** Per-call time limits: stop starting new items after `soft`; every outside call ends by `hard`. */
export interface Budget { soft: number; hard: number }

export const PRODUCT_COLS = 'id,vendor_id,source,source_ref,raw_text,sku,name,category,fabric,color,sizes,in_stock,temp_out_at,perm_out_at,cost_price,less_amount,sell_price,price_note,attributes,tags,missing_attrs,status,locked,ai_read_at,ai_error,claimed_at,source_posted_at,created_at,updated_at';
export const LISTING_COLS = 'id,product_id,website_id,status,rule_id,price,compare_at_price,title,description_html,seo_title,seo_description,handle,tags,product_type,image_alts,locked,ai_model,ai_effort,ai_cost_usd,generated_at,shopify_product_id,shopify_status,published_at,first_published_at,attempts,claimed_at,error,created_at,updated_at,sku_colour';
export const WEBSITE_COLS = 'id,name,shop_domain,auth_mode,api_version,active,publish_mode,routing_default,track_inventory,pricing,tag_rules,content,connected_at,shop_name,last_error';
export const RULE_COLS = 'id,website_id,position,name,enabled,action,conditions,price_override';

export const BUCKET = 'playbook-products';
/** A stuck claim (crashed run) is taken over after this long. */
export const STALE_MS = 5 * 60_000;
/** A failed publish is retried after this long, up to MAX_ATTEMPTS. */
export const RETRY_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Listing error written when its product was archived; routing undoes this skip once the product is ready again. */
export const ARCHIVED = 'The product was archived.';
/** A listing is not written or published while its product lacks a necessary detail (the gate: pb_products_refresh / tagGate.ts). */
export const NEEDS_INFO = 'The product is held in Needs info: it needs its cost price, category, fabric, colour, a photo and a value for every attribute of its category, or it looks already added. Open the product to see which.';
/** Ready for websites: a category plus EITHER a cost price (priced by the website's rules) OR a selling price copied from another store. */
/** Permanently out of stock (a vendor said so and nobody switched Stock back on): archived on Shopify, never made or updated there. */
export const permOut = (p: { in_stock?: boolean; perm_out_at?: string | null }) => p.in_stock === false && !!p.perm_out_at;
export const hasPrice = (p: { cost_price: number | null; sell_price?: number | null }) =>
  (p.cost_price !== null && p.cost_price !== undefined) || (p.sell_price !== null && p.sell_price !== undefined);
