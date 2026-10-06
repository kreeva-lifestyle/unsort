// What a SKU's costing sheet can fill in on a new job: the component being
// sent (TOP / LEHANGA / DUPATTA…), the labour lines that price outside work
// (JOBWORK ₹523, HANDWORK ₹560…) as one-tap rate suggestions, and the
// physical materials of that component with their usage per piece.
import { selectedSupplier, num, type CostingComponent } from '../minis/costing/costingModel';
import type { MaterialDraft } from './jobworkApi';

const LABOUR = /job\s*work|hand\s*work|embroid|print|dye|dyeing|cut\s*work|aari|zari|sequin|mirror|smock/i;
const PHYSICAL_UNITS = new Set(['Meter', 'Yard', 'Kg', 'Gram']);

export interface RateHint { label: string; rate: number }

export const componentNames = (components: CostingComponent[]): string[] =>
  [...new Set(components.map(c => c.name.trim()).filter(Boolean))];

const findComp = (components: CostingComponent[], name: string) =>
  components.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());

/** Outside-work lines of the component, e.g. "JOBWORK ₹523". */
export function rateHints(components: CostingComponent[], comp: string): RateHint[] {
  const c = findComp(components, comp);
  if (!c) return [];
  return c.subs
    .filter(s => LABOUR.test(s.name) && !/material/i.test(s.name))
    .map(s => ({ label: s.name.trim(), rate: Math.round(num(s.qty || 1) * num(selectedSupplier(s)?.rate) * 100) / 100 }))
    .filter(h => h.rate > 0);
}

/** Fabric-type lines of the component with their usage per piece. */
export function materialHints(components: CostingComponent[], comp: string): MaterialDraft[] {
  const c = findComp(components, comp);
  if (!c) return [];
  return c.subs
    .filter(s => s.name.trim() && PHYSICAL_UNITS.has(s.unit))
    .map(s => ({ name: s.name.trim(), unit: s.unit, per_piece: num(s.qty) > 0 ? String(num(s.qty)) : '' }));
}
