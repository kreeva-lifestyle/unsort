// Pure: does a website say who makes its products? (owner, 2026-11-13: "Before importing can we check whether the
// website has manufacturer or vendor name mentioned. And show alert whether its there or not.")
// Counted on every product "Check website" reads (Shopify: the whole list it already counts; WooCommerce and other
// stores: the products it samples). A product names a maker when it has:
//   - a manufacturer in its page data (JSON-LD: meta.manufacturer),
//   - a "Manufactured by / Marketed by / Packed by …" or "Manufacturer: / Brand: / Vendor: / Sold by:" line in its
//     description (one line; the name ends at the line's end, ". " after a word, ", " or two spaces),
//   - or a brand / vendor field (meta.brand) that is NOT the website's own name.
// The website's own name (its host's first part or its site name, spaces and case aside) is kept apart as `own`:
// acriine.in puts "ACRIINE" on all 391 products, and names "Shayam Creation" in one description only.
// No I/O; tested in test/importMaker.test.mjs.
import { tagKey } from '../tagText.ts';

export interface MakerCheck {
  /** Products looked at. */
  checked: number;
  /** Products that name a maker other than the website itself. */
  named: number;
  /** Those makers, most products first (at most 5). */
  names: { name: string; products: number }[];
  /** The website's own name, when products give it as their brand / vendor (the most used spelling). */
  own: string | null;
}

const BY = /\b(?:manufactured|marketed|packed|made|designed)(?:\s*(?:\/|&|and)\s*(?:manufactured|marketed|packed))?\s+by\s*[:\-–]?\s*([^\n:;|()]{2,80})/i;
const LABEL = /\b(?:manufacturer|brand(?:\s+name)?|vendor|sold\s+by|seller)\s*[:\-–]\s*([^\n:;|()]{2,80})/i;
const squash = (s: string) => tagKey(s).replace(/\s+/g, '');
/** The name only: it ends at ". " after a word (not an initial: "S.K. Creations"), at two spaces or at ", ". */
const clean = (s: string) => s.split(/(?<=\p{L}{3})\.\s|\s{2,}|,\s/u)[0].replace(/[.\s]+$/, '').trim().slice(0, 60);

/** The maker names one product gives, in that order: page data, description, brand / vendor field. */
export function makersOf(f: { description?: string | null; meta?: Record<string, string> }): string[] {
  const out: string[] = [];
  if (f.meta?.manufacturer) out.push(...f.meta.manufacturer.split(', '));
  const text = String(f.description ?? '');
  for (const re of [BY, LABEL]) { const m = re.exec(text); if (m) out.push(clean(m[1])); }
  if (f.meta?.brand) out.push(...f.meta.brand.split(', '));
  const seen = new Set<string>();
  return out.map(s => s.trim()).filter(s => s.length >= 2 && /\p{L}/u.test(s) && !seen.has(squash(s)) && !!seen.add(squash(s)));
}

/** Counted as the products are read: a store of 5,000 is checked without keeping them. */
export function makerTally() {
  const per: string[][] = [];
  return {
    add(f: { description?: string | null; meta?: Record<string, string> }) { per.push(makersOf(f)); },
    result(site: { name: string | null; host: string }): MakerCheck {
      const host = squash(site.host.replace(/^www\./i, '').split('.')[0]), name = squash(site.name ?? '');
      const isOwn = (s: string) => {
        const k = squash(s);
        return !!k && (k === host || k === name || (k.length >= 4 && host.length >= 4 && (name.includes(k) || k.includes(host) || host.includes(k))));
      };
      const makers = new Map<string, { name: string; products: number }>(), owns = new Map<string, { name: string; products: number }>();
      const count = (m: Map<string, { name: string; products: number }>, s: string) => {
        const k = squash(s), cur = m.get(k);
        if (cur) cur.products++; else m.set(k, { name: s, products: 1 });
      };
      let named = 0;
      for (const list of per) {
        const real = list.filter(s => !isOwn(s));
        if (real.length) named++;
        real.forEach(s => count(makers, s));
        list.filter(isOwn).forEach(s => count(owns, s));
      }
      const top = (m: Map<string, { name: string; products: number }>) => [...m.values()].sort((a, b) => b.products - a.products || a.name.localeCompare(b.name));
      return { checked: per.length, named, names: top(makers).slice(0, 5), own: top(owns)[0]?.name ?? null };
    },
  };
}
