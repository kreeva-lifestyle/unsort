// Words for the Tags screens (plain data, no React): counts, the look-alike
// sentence, and "Uses: Colour, Work".
import type { CSSProperties } from 'react';
import { REASON_LABEL, type PbAttribute, type PbLookAlike } from '../../tagTypes';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "'Embroided' looks like 'Embroidery' (Work) — a likely typo". */
export const lookSentence = (phrase: string, m: PbLookAlike) =>
  `“${phrase}” looks like “${m.value}” (${m.attribute}) — ${REASON_LABEL[m.reason]}${m.via && m.via.toLowerCase() !== m.value.toLowerCase() ? `, via “${m.via}”` : ''}.`;

/** "Colour, Work and Fabric" */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const attrNames = (ids: string[], attrs: PbAttribute[]) => ids.map(id => attrs.find(a => a.id === id)?.name).filter((n): n is string => !!n);

/** A button whose label may be long (an attribute or value name): it wraps instead of clipping. */
export const WRAP: CSSProperties = { whiteSpace: 'normal', padding: '8px 16px', textAlign: 'center' };
