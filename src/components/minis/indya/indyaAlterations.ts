// Indya Import's "with alterations" stock column: every computed row plus
// the same product's stock one size up (lib/sizeAlteration.ts, owner's
// rule). Rows the compute could not resolve keep their "SKU mismatch"
// text; everything else is a number again. Sibling rows (Indya lists one
// product under two or three SKUs with identical stock) are mirrors, so a
// size's stock is the max across them, never their sum.
import { withAlterations } from '../../../lib/sizeAlteration';
import { baseOf, shapeKey } from './indyaSku';
import { MISMATCH, type ResultRow } from './indyaCompute';

export function alterationStocks(rows: ResultRow[]): string[] {
  const alt = withAlterations(rows,
    r => (r.unstitched ? null : { product: shapeKey(baseOf(r.key, r.size)), size: r.size }),
    r => (r.out === MISMATCH ? 0 : Number(r.out) || 0), 'max');
  return rows.map((r, i) => (r.out === MISMATCH ? MISMATCH : String(alt[i])));
}

/** How many rows the alteration rule changed — for the toast. */
export const alteredCount = (rows: ResultRow[], alt: string[]): number => rows.reduce((n, r, i) => n + (alt[i] !== r.out ? 1 : 0), 0);
