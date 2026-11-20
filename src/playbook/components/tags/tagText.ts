// Words for the Tags screens (plain data, no React): counts, the look-alike
// sentence, the toast after a category rename, and "Uses: Colour, Work".
import type { CSSProperties } from 'react';
import { REASON_LABEL, type PbAttribute, type PbLookAlike, type PbStoreRename } from '../../tagTypes';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "'Embroided' looks like 'Embroidery' (Work) — a likely typo". */
export const lookSentence = (phrase: string, m: PbLookAlike) =>
  `“${phrase}” looks like “${m.value}” (${m.attribute}) — ${REASON_LABEL[m.reason]}${m.via && m.via.toLowerCase() !== m.value.toLowerCase() ? `, via “${m.via}”` : ''}.`;

/** The toast after a category rename. The websites follow by themselves, so it says so. A website whose collection could not be
 *  renamed is named with the reason: the rename itself is done, so that is a note ('info'), not an error. */
export function renamedSaid(from: string, to: string, r: { renamed: number; stores?: PbStoreRename[] }): { text: string; type: 'success' | 'info' } {
  const said = `Renamed ${from} to ${to}${r.renamed ? ` — ${plural(r.renamed, 'product')} follow` : ''}`;
  const bad = (r.stores ?? []).filter(s => s.status === 'failed').map(s => {
    // The server's own sentences start with the website's name and end with a full stop; Shopify's refusals do neither.
    const why = (s.note?.startsWith(`${s.website}:`) ? s.note.slice(s.website.length + 1) : s.note ?? '').trim().replace(/\.$/, '');
    return `${s.website}${why ? ` (${why})` : ''}`;
  });
  if (bad.length) return { text: `${said}. On ${andList(bad)} the collection kept its old name: check it in Shopify. The products there still follow by themselves`, type: 'info' };
  // Something to follow: products that may be on a website, or a collection that took the new name.
  const follows = !!r.stores?.length && (r.renamed > 0 || r.stores.some(s => s.status === 'renamed'));
  return { text: `${said}${follows ? '. Your websites follow by themselves within a few minutes' : ''}`, type: 'success' };
}

/** "Colour, Work and Fabric" */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const attrNames = (ids: string[], attrs: PbAttribute[]) => ids.map(id => attrs.find(a => a.id === id)?.name).filter((n): n is string => !!n);

/** A button whose label may be long (an attribute or value name): it wraps instead of clipping. */
export const WRAP: CSSProperties = { whiteSpace: 'normal', padding: '8px 16px', textAlign: 'center' };

/** "Plain", "No Work", "None", "Solid": a value that means none of the others (the server's tagText.ts isNoneValue twin). */
export const isNoneValue = (name: string) => /^(?:plain|none|solid|no [a-z]+)(?: work)?$/.test(name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
