// Tags as a controlled taxonomy (owner, 2026-11-10): Category → Attributes →
// Attribute values, built by hand on the Tags page; Playbook only chooses
// from it. Mirrors supabase/migrations/20261110090000_pb_tags.sql and the
// pb-products tag actions (docs/playbook/product-directory-spec.md "Tags").

export interface PbAttrValue {
  id: string; attribute_id: string; name: string; key: string;
  /** "Also known as" words (normalized keys): kala, kaala… */
  aliases: string[];
  position: number;
  /** The categories it is offered for while its attribute's values depend on the category (Product Type). */
  categories: string[];
  /** Products carrying it (taxonomy_get). */
  uses?: number;
}

export interface PbAttribute {
  id: string; name: string; key: string;
  /** Several values per product (Colour) or one only (Fabric). */
  multi: boolean;
  position: number;
  /** Tags as "Colour_Black" on stores with the prefixed tag style; null = the attribute's name. */
  shopify_prefix: string | null;
  /** "Values depend on the category" (owner, 13 Nov 2026: Product Type): each value is offered only for the categories
   *  ticked on it, and one with none ticked nowhere — to the word rules, the AI and staff (pb_tag_offered). */
  by_category: boolean;
  values: PbAttrValue[];
}

/** A category name as the server compares it: case, accents, spaces and punctuation aside. */
export const catKey = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
/** Is this value offered for a product of this category? Mirrors pb-products taxonomy.ts offered(). */
export const offeredFor = (a: Pick<PbAttribute, 'by_category'>, v: Pick<PbAttrValue, 'categories'>, category: string | null | undefined) =>
  !a.by_category || (!!catKey(category) && (v.categories ?? []).some(c => catKey(c) === catKey(category)));

export interface PbCategoryLink { category: string; attribute_id: string; position: number }
export interface PbLinkStat { category: string; attribute_id: string; products: number; lacking: number }

/** "Let AI decide" progress: the newest batch of requests together (pb-products fillProgress.ts). `per_min` / `eta_min`: the
 *  pace of the last 5 minutes and the minutes it leaves; `blocked`: why nothing moves while products wait. */
export interface PbFillRun {
  id: string; total: number; done: number; waiting: number; filled: number; left_empty: number; created_at: string; finished_at: string | null;
  runs?: number; per_min?: number | null; eta_min?: number | null; blocked?: 'paused' | 'limit' | null;
}

export interface PbTaxonomy {
  categories: string[]; attributes: PbAttribute[]; links: PbCategoryLink[]; stats: PbLinkStat[];
  category_products: { category: string; products: number }[]; suggestions_pending: number; fill: PbFillRun | null;
}

export type PbLookReason = 'same' | 'same_word' | 'word_order' | 'translation' | 'shade' | 'typo' | 'similar';
/** A value that looks like a phrase (the look-alike guard). */
export interface PbLookAlike {
  value_id: string; value: string; attribute_id: string; attribute: string; via: string;
  reason: PbLookReason; score: number; other_attribute: boolean;
}

export type PbSuggestionStatus = 'pending' | 'added' | 'aliased' | 'ignored';
/** The nearest value already in the lists (pb-products tagNearest.ts), by the word rules or the AI; value_id null = the AI found none close. */
export interface PbNearest { value_id: string | null; value: string | null; attribute_id: string | null; attribute: string | null; why: string; by: 'rules' | 'ai' }

export interface PbSuggestion {
  id: string; phrase: string; key: string; attribute_id: string | null; status: PbSuggestionStatus;
  uses: number; examples: string[]; example_names: string[]; source: 'store' | 'ai' | 'text';
  first_seen_at: string; last_seen_at: string; matches: PbLookAlike[];
  /** null = not looked at yet: the Tags page asks the AI (nearestSuggestions). */
  nearest: PbNearest | null;
}

export type PbValueSource = 'rules' | 'ai' | 'manual';
export interface PbProductValue { value_id: string; source: PbValueSource }

export const SOURCE_LABEL: Record<PbValueSource, string> = { rules: 'Auto', ai: 'AI', manual: 'You' };
export const REASON_LABEL: Record<PbLookReason, string> = {
  same: 'same word', same_word: 'same word, another form', word_order: 'same words, another order', translation: 'Hindi / English',
  shade: 'a shade of it', typo: 'a likely typo', similar: 'spelled almost the same',
};

export interface PbRetagResult { dry_run: boolean; products: number; locked: number; changed: number; to_needs_info: number; to_ready: number; sample: { name: string; added: string[]; removed: string[] }[] }
