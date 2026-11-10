// Tags (owner, 2026-11-10): the tag library (pb_tags), the cleaning rules
// (pb_settings key 'tags') and the shapes the pb-products tag actions answer
// with. Mirrors supabase/migrations/20261110090000_pb_tags.sql and
// supabase/functions/pb-products/tagClean.ts. A product's own tags are
// PbProduct.tags (types.ts); websites use them through the {tags} placeholder.

export type PbTagKind = 'collection' | 'category' | 'fabric' | 'colour' | 'occasion' | 'style' | 'work' | 'size' | 'other';
export type PbTagSource = 'store' | 'ai' | 'manual' | 'facts';

export const TAG_KINDS: { id: PbTagKind; label: string }[] = [
  { id: 'other', label: 'Other' }, { id: 'collection', label: 'Collection' }, { id: 'category', label: 'Category' },
  { id: 'fabric', label: 'Fabric' }, { id: 'colour', label: 'Colour' }, { id: 'occasion', label: 'Occasion' },
  { id: 'style', label: 'Style' }, { id: 'work', label: 'Work' }, { id: 'size', label: 'Size' },
];
export const TAG_SOURCE_LABEL: Record<PbTagSource, string> = { store: 'From a website', ai: 'From the AI', manual: 'Typed by staff', facts: 'From the facts' };

/** One library row. `hidden`: never sent to a website, but it stays on the products. `merged_into`: an alias of that tag. */
export interface PbTag {
  id: string; name: string; key: string; kind: PbTagKind; hidden: boolean; merged_into: string | null;
  source: PbTagSource; uses: number; reviewed_at: string | null; first_seen_at: string; last_seen_at: string;
  created_at: string; updated_at: string;
}

/** A review-queue row (pb_tags_review): the library row plus up to 3 example product names. */
export type PbTagReview = Pick<PbTag, 'id' | 'name' | 'key' | 'kind' | 'hidden' | 'source' | 'uses' | 'reviewed_at' | 'first_seen_at'> & { examples: string[] };

/** The cleaning rules (Settings → Tags → Rules). Patterns are case-insensitive regular expressions. */
export interface PbTagSettings {
  hide_patterns: string[]; hide_exact: string[]; max_per_product: number; min_len: number;
  title_case: boolean; auto_hide_codes: boolean;
}
export const DEFAULT_TAG_SETTINGS: PbTagSettings = {
  hide_patterns: ['^_', '^size[_ ]?chart$', '^label[_ ]', '^[a-z]{1,3}\\d{2,}$'],
  hide_exact: [], max_per_product: 25, min_len: 2, title_case: true, auto_hide_codes: true,
};
export const TAG_LIMITS = { patterns: 50, patternLen: 80, maxPerProduct: 100, minLen: 20 } as const;

/** Why a tag was dropped (tagClean.ts). */
export type PbHideReason = 'empty' | 'short' | 'pattern' | 'exact' | 'code' | 'duplicate' | 'cap';
export interface PbHidden { tag: string; reason: PbHideReason; pattern?: string }

export type PbTagAction = 'keep' | 'hide' | 'unhide' | 'merge' | 'rename' | 'kind';
export const TAG_PAGE = 25;
