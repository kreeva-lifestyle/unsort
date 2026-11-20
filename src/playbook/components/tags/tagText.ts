// Words for the Tags screens (plain data, no React): counts, the look-alike
// sentence, the toast after a category rename, and "Uses: Colour, Work".
import type { CSSProperties } from 'react';
import { REASON_LABEL, type PbAttribute, type PbLookAlike, type PbStoreRename } from '../../tagTypes';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "'Embroided' looks like 'Embroidery' (Work) — a likely typo". */
export const lookSentence = (phrase: string, m: PbLookAlike) =>
  `“${phrase}” looks like “${m.value}” (${m.attribute}) — ${REASON_LABEL[m.reason]}${m.via && m.via.toLowerCase() !== m.value.toLowerCase() ? `, via “${m.via}”` : ''}.`;

/** The toast after a category rename, one sentence per store answer (pb-products storeCollections.ts): 'renamed' —
 *  the websites follow by themselves; 'kept' — the store has a collection of its own for the new name, so the products
 *  move into it and the old one keeps its name; 'failed' — not renamed yet, and Playbook gives it the new name itself
 *  when it sends the first product of the category; 'none' — nothing to rename there. The rename itself is done, so a
 *  store's answer is a note ('info'), never an error. */
export function renamedSaid(from: string, to: string, r: { renamed: number; stores?: PbStoreRename[] }): { text: string; type: 'success' | 'info' } {
  const said = `Renamed ${from} to ${to}${r.renamed ? ` — ${plural(r.renamed, 'product')} follow` : ''}`;
  const stores = r.stores ?? [];
  const failed = stores.filter(s => s.status === 'failed').map(s => {
    // The server's own sentences start with the website's name and end with a full stop, some with "it will be tried
    // again" (that is about the Shopify call, not this collection); Shopify's refusals do neither.
    const why = (s.note?.startsWith(`${s.website}:`) ? s.note.slice(s.website.length + 1) : s.note ?? '').replace(/\s*—\s*it will be tried again.*$/i, '').trim().replace(/\.$/, '');
    return `${s.website}${why ? ` (${why})` : ''}`;
  });
  const kept = stores.filter(s => s.status === 'kept').map(s => s.website);
  const notes = [
    ...(failed.length ? [`On ${andList(failed)} the collection is not renamed yet: Playbook gives it the new name when it sends the first product of ${to}`] : []),
    ...(kept.length ? [`${andList(kept)} already ${kept.length === 1 ? 'has' : 'have'} a collection for ${to}: the products move into it, and the one for ${from} keeps its name`] : []),
  ];
  if (notes.length) return { text: `${said}. ${notes.join('. ')}`, type: 'info' };
  // Something to follow: products that may be on a website, or a collection that took the new name.
  const follows = !!stores.length && (r.renamed > 0 || stores.some(s => s.status === 'renamed'));
  return { text: `${said}${follows ? '. Your websites follow by themselves within a few minutes' : ''}`, type: 'success' };
}

/** "Colour, Work and Fabric" */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const attrNames = (ids: string[], attrs: PbAttribute[]) => ids.map(id => attrs.find(a => a.id === id)?.name).filter((n): n is string => !!n);

/** A button whose label may be long (an attribute or value name): it wraps instead of clipping. */
export const WRAP: CSSProperties = { whiteSpace: 'normal', padding: '8px 16px', textAlign: 'center' };

/** "Plain", "No Work", "None", "Solid": a value that means none of the others (the server's tagText.ts isNoneValue twin). */
export const isNoneValue = (name: string) => /^(?:plain|none|solid|no [a-z]+)(?: work)?$/.test(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
