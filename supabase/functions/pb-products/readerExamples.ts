// How the owner filed earlier products from the same place (owner, 13 Nov 2026: "remember mapping"; no word
// cards). A category a person chose on a product page joins the product's `locked` list, and that product becomes
// an example: when the reader reads a product from the same website (import: the host in source_ref, with or
// without www) or the same vendor (Telegram), the closest examples go into its prompt, so it files the product the
// way the owner did — one website's "Dresses" that are salwar suits stay salwar suits. Only a person's choices count,
// never the AI's own, and only categories still on the list. Best effort: no examples is no change.
import { enc, sel } from './db.ts';
import { hostTwin } from './import/body.ts';
import { words } from './tagText.ts';
import type { ProductRow } from './types.ts';

const MAX = 8, POOL = 200;
export interface Example { name: string | null; category: string | null; ptype?: string | null }

/** The products from the same place as `p`, as a PostgREST filter ('' when its place is not known). */
export function samePlace(p: Pick<ProductRow, 'source' | 'source_ref' | 'vendor_id'>): string {
  if (p.source === 'import') {
    const host = String(p.source_ref || '').split(':')[0].trim().toLowerCase();
    if (!host || !String(p.source_ref).includes(':')) return '';
    return `source=eq.import&or=(${enc([host, hostTwin(host)].map(h => `source_ref.like."${h}:*"`).join(','))})`;
  }
  return p.vendor_id ? `vendor_id=eq.${enc(p.vendor_id)}` : '';
}

/** The examples most like this product (most words in common with its name and the start of its text; the newest
 *  first among equals), at most 8, in the list's own spelling of each category. */
export function pickExamples(p: { name: string | null; raw_text: string | null }, rows: Example[], categories: string[]): Example[] {
  const on = new Map(categories.map(c => [c.trim().toLowerCase(), c]));
  const mine = new Set(words(`${p.name ?? ''} ${String(p.raw_text ?? '').slice(0, 300)}`).filter(w => w.length > 2));
  return rows.filter(r => String(r.name ?? '').trim() && on.has(String(r.category ?? '').trim().toLowerCase()))
    .map((r, i) => ({ r, i, n: words(r.name).filter(w => w.length > 2 && mine.has(w)).length }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, MAX).map(x => ({ ...x.r, category: on.get(String(x.r.category).trim().toLowerCase()) ?? x.r.category }));
}

/** The reader's lines about them; '' when there are none. */
export async function ownerExamples(p: ProductRow, categories: string[]): Promise<string> {
  const place = samePlace(p);
  if (!place || !categories.length) return '';
  const rows = await sel<Example>(`pb_products?${place}&locked=cs.{category}&category=not.is.null&status=neq.archived&id=neq.${enc(p.id)}`
    + `&select=name,category,ptype:attributes->>product_type&order=updated_at.desc&limit=${POOL}`);
  const ex = pickExamples(p, rows, categories);
  if (!ex.length) return '';
  return [
    `The owner filed these earlier products from the same ${p.source === 'import' ? 'website' : 'vendor'} by hand:`,
    ...ex.map(e => `- "${String(e.name).slice(0, 120)}"${e.ptype ? ` (the store's own type: ${String(e.ptype).slice(0, 60)})` : ''} → ${e.category}`),
    'Choose the category the same way for a product like one of these: they are the owner\'s own choices for this place, and they come before what the store\'s type word seems to say.',
  ].join('\n');
}
