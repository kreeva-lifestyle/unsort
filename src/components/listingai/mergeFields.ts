// Merge a re-uploaded marketplace sheet into an existing template.
// Marketplaces change their sheets partially — the owner's per-column work
// (mandatory ticks, fixed values, skips, hints) must survive on columns that
// still exist, while the marketplace's NEW dropdown lists always win.
import { normHeader } from './templateParse';
import type { ListingTemplateField } from '../../types/database';

export interface MergeSummary {
  added: string[];        // columns new in this sheet version
  removed: string[];      // columns the marketplace dropped
  listsChanged: string[]; // columns whose dropdown values changed
  fixedDropped: string[]; // fixed values no longer valid in the new list
  kept: number;           // columns whose settings carried over
}

export function mergeTemplateFields(
  oldFields: ListingTemplateField[],
  newFields: ListingTemplateField[],
): { fields: ListingTemplateField[]; summary: MergeSummary } {
  const oldBy = new Map(oldFields.map(f => [normHeader(f.header), f]));
  const newKeys = new Set(newFields.map(f => normHeader(f.header)));
  const summary: MergeSummary = { added: [], removed: [], listsChanged: [], fixedDropped: [], kept: 0 };

  const fields = newFields.map(nf => {
    const of = oldBy.get(normHeader(nf.header));
    if (!of) { summary.added.push(nf.header); return nf; }
    summary.kept++;
    if (JSON.stringify(of.allowed || []) !== JSON.stringify(nf.allowed || [])) summary.listsChanged.push(nf.header);
    // Owner's fixed value survives only while the new list still allows it;
    // otherwise fall back to the new auto-pin (single-value dropdown) or none.
    let fixed = of.fixed || '';
    if (fixed && nf.allowed?.length && !nf.allowed.some(a => a.toLowerCase() === fixed.toLowerCase())) {
      summary.fixedDropped.push(`${nf.header} (was "${fixed}")`);
      fixed = '';
    }
    if (!fixed) fixed = nf.fixed || '';
    return {
      ...nf, // new header casing + NEW allowed list from the marketplace
      mandatory: of.mandatory,
      hint: of.hint || nf.hint,
      ...(of.skip ? { skip: true } : {}),
      ...(fixed ? { fixed } : {}),
    };
  });

  summary.removed = oldFields.filter(f => !newKeys.has(normHeader(f.header))).map(f => f.header);
  return { fields, summary };
}

// One-line human description for the toast / editor banner.
export const describeMerge = (s: MergeSummary): string => {
  const bits = [
    s.added.length ? `+${s.added.length} new: ${s.added.slice(0, 4).join(', ')}${s.added.length > 4 ? '…' : ''}` : '',
    s.removed.length ? `−${s.removed.length} removed: ${s.removed.slice(0, 4).join(', ')}${s.removed.length > 4 ? '…' : ''}` : '',
    s.listsChanged.length ? `${s.listsChanged.length} dropdown list(s) changed` : '',
    s.fixedDropped.length ? `fixed value no longer valid on: ${s.fixedDropped.join(', ')}` : '',
  ].filter(Boolean);
  return `${bits.length ? bits.join(' · ') : 'No layout changes'} · your settings kept on ${s.kept} column(s)`;
};
