// Pure: a product's OWN tag set (pb_products.tags) — the one source every
// website builds from ({tags} in tags.ts). No I/O; tested with node --test.
// Union, in this order: facts (category, fabric, colour, and the reader's
// occasion / work / pattern attributes, split on commas, short values only),
// the store's tags (attributes.store_tags) cleaned, the tags already on the
// product, then the AI's extra tags (new extras only fill the room left, so a
// regenerate never pushes older tags past the cap); each candidate goes
// through the rules (tagClean.ts) except the product's existing tags when
// `keepExisting` (what staff typed, or a read / write that must not re-clean
// them) and tags staff reviewed and kept in the library; deduped by key;
// library aliases replaced by the canonical name; library-hidden tags STAY on
// the product (flagged — websites leave them out) and, when already on it,
// bypass the rules so un-hiding restores them; capped at max_per_product.
// Where it runs (tagStore.ts): ingest (store tags), after the reader (facts),
// when the writer's extra_tags come back (generate.ts), set_product_tags and
// the re-clean (tagsActions.ts).
import { type Hidden, type TagSettings, cleanTags, normalizeTag, splitStoreTags, tagKey } from './tagClean.ts';

export type TagSource = 'facts' | 'store' | 'ai' | 'manual';

/** What the engine needs from the library (pb_tags): aliases and hidden tags, by key. */
export interface TagLibrary {
  /** alias key → canonical display name */
  alias: Map<string, string>;
  /** keys of tags hidden from every website */
  hidden: Set<string>;
  /** keys staff reviewed and kept: the hide rules no longer apply to them */
  kept: Set<string>;
}

export const emptyLibrary = (): TagLibrary => ({ alias: new Map(), hidden: new Set(), kept: new Set() });

export interface LibraryRow { id: string; name: string; key: string; hidden: boolean; merged_into: string | null; reviewed_at?: string | null }
/** One hidden candidate and which source it came from. */
export type HiddenTag = Hidden & { src: TagSource };

/** Library rows → the lookup the engine uses (alias chains followed). */
export function libraryOf(rows: LibraryRow[]): TagLibrary {
  const byId = new Map(rows.map(r => [r.id, r]));
  const lib = emptyLibrary();
  for (const r of rows) {
    if (r.hidden) lib.hidden.add(r.key);
    else if (r.reviewed_at && !r.merged_into) lib.kept.add(r.key);
    if (r.merged_into) {
      let to = byId.get(r.merged_into); let hops = 0;
      while (to?.merged_into && hops++ < 5) to = byId.get(to.merged_into);
      if (to && to.id !== r.id) lib.alias.set(r.key, to.name);
    }
  }
  return lib;
}

export interface ProductTagInput {
  facts?: { category?: string | null; fabric?: string | null; color?: string | null };
  attributes?: Record<string, string> | null;
  /** attributes.store_tags as stored (comma string) or a list; defaults to attributes.store_tags */
  storeTags?: unknown;
  aiExtra?: unknown[];
  existing?: unknown[];
  /** keep the existing tags as they are (staff typed them, or this run must not re-clean them): no hide rules on that group */
  keepExisting?: boolean;
}

export interface ProductTagResult {
  tags: string[];
  /** library-hidden tags that stay on the product but go to no website */
  flagged: string[];
  hidden: HiddenTag[];
  /** which source each kept tag came from (first wins) */
  sources: Record<string, TagSource>;
}

const FACT_ATTRS = ['occasion', 'work', 'pattern'];
const MAX_FACT_LEN = 40; const MAX_FACT_WORDS = 4;

/** A fact's value as tag candidates: comma-separated pieces, short ones only (a sentence is not a tag). */
export function factPieces(v: unknown): string[] {
  return String(v ?? '').split(',').map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s && s.length <= MAX_FACT_LEN && s.split(' ').length <= MAX_FACT_WORDS);
}

export function productTags(input: ProductTagInput, rules: TagSettings, lib: TagLibrary = emptyLibrary()): ProductTagResult {
  const f = input.facts || {};
  const a = input.attributes || {};
  // a tag staff hid in the library bypasses the rules once it is on the product: it stays (flagged) until un-hidden
  const onProduct = new Set([...lib.kept, ...lib.hidden]);
  const groups: { src: TagSource; raw: unknown[]; skipRules: boolean; allow: Set<string> }[] = [
    { src: 'facts', raw: [f.category, f.fabric, f.color, ...FACT_ATTRS.map(k => a[k])].flatMap(factPieces), skipRules: false, allow: lib.kept },
    { src: 'store', raw: Array.isArray(input.storeTags) ? input.storeTags : splitStoreTags(input.storeTags ?? a.store_tags), skipRules: false, allow: lib.kept },
    { src: 'manual', raw: Array.isArray(input.existing) ? input.existing : [], skipRules: input.keepExisting === true, allow: onProduct },
    { src: 'ai', raw: Array.isArray(input.aiExtra) ? input.aiExtra : [], skipRules: false, allow: lib.kept },
  ];
  const seen = new Set<string>(); const tags: string[] = []; const flagged: string[] = []; const hidden: HiddenTag[] = [];
  const sources: ProductTagResult['sources'] = {};
  const wide = { ...rules, max_per_product: 10_000 }; // the cap is applied once, over the union
  for (const g of groups) {
    const c = cleanTags(g.raw, wide, g.skipRules, g.allow);
    hidden.push(...c.hidden.filter(h => h.reason !== 'duplicate').map(h => ({ ...h, src: g.src })));
    for (const t0 of c.kept) {
      const t = lib.alias.get(tagKey(t0)) ?? t0;
      const k = tagKey(t);
      if (seen.has(k)) continue;
      if (tags.length >= rules.max_per_product) { hidden.push({ tag: t, reason: 'cap', src: g.src }); continue; }
      seen.add(k); tags.push(t); sources[t] = g.src;
      if (lib.hidden.has(k)) flagged.push(t);
    }
  }
  return { tags, flagged, hidden, sources };
}

/** The tags a website may use: the product's tags minus the library-hidden ones. */
export const visibleTags = (tags: unknown[], lib: TagLibrary) =>
  (Array.isArray(tags) ? tags : []).map(t => normalizeTag(t, false)).filter(t => t && !lib.hidden.has(tagKey(t)));

/** True when two tag lists hold the same tags in the same order. */
export const sameTags = (a: unknown[], b: unknown[]) => JSON.stringify(a || []) === JSON.stringify(b || []);
