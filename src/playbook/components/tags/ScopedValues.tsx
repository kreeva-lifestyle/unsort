// The values of an attribute whose values depend on the category (Product Type), on the Tags page: grouped under the
// categories they are ticked for (owner, 13 Nov 2026: "the values are to be mapped against the category, so no
// mistake can happen"). A value ticked for two categories shows under both. Two review-tinted lines say what still
// needs the owner: categories that use the attribute with no value ticked for them (their products cannot be
// finished), and values ticked for no category on the list (offered nowhere). Tap a value → its sheet, where its
// categories are ticked.
import { catKey, type PbAttrValue, type PbAttribute, type PbCategoryLink } from '../../tagTypes';
import { PB, pbMeta } from '../../pbTheme';
import { Dot } from '../product/status';
import ValueChip, { CHIP_ITEM, CHIP_LIST } from './ValueChip';
import { andList } from './tagText';

const note = { ...pbMeta, color: PB.tx, whiteSpace: 'normal' } as const;

export default function ScopedValues({ attr, categories, links, onOpen, canEdit }: {
  attr: PbAttribute; categories: string[]; links: PbCategoryLink[]; onOpen: (v: PbAttrValue) => void; canEdit: boolean;
}) {
  const uses = new Set(links.filter(l => l.attribute_id === attr.id).map(l => catKey(l.category)));
  const listed = new Set(categories.map(catKey));
  const groups = categories.map(c => ({ c, vs: attr.values.filter(v => v.categories.some(x => catKey(x) === catKey(c))) }));
  const empty = groups.filter(g => !g.vs.length && uses.has(catKey(g.c))).map(g => g.c);
  const nowhere = attr.values.filter(v => !v.categories.some(x => listed.has(catKey(x))));
  if (!attr.values.length) {
    return <span style={{ ...pbMeta, color: PB.tx2 }}>No values yet — add the first one below, then tick the categories it belongs to.</span>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {empty.length > 0 && (
        <Dot color={PB.review} style={note}
          label={`${andList(empty)} ${empty.length === 1 ? 'needs' : 'need'} a ${attr.name}, but no value is ticked for ${empty.length === 1 ? 'it' : 'them'} — those products can't be finished.`} />
      )}
      {groups.filter(g => g.vs.length).map(g => (
        <div key={g.c} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{ ...pbMeta, fontWeight: 600, color: PB.tx2, overflowWrap: 'anywhere' }}>{g.c}</span>
          <ul aria-label={`${attr.name} values for ${g.c}`} style={CHIP_LIST}>
            {g.vs.map(v => <li key={v.id} style={CHIP_ITEM}><ValueChip v={v} onOpen={() => onOpen(v)} disabled={!canEdit} /></li>)}
          </ul>
        </div>
      ))}
      {nowhere.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <Dot color={PB.review} style={note} label={`No category ticked — ${nowhere.length === 1 ? 'it is' : 'they are'} offered nowhere until you tick one`} />
          <ul aria-label={`${attr.name} values with no category`} style={CHIP_LIST}>
            {nowhere.map(v => <li key={v.id} style={CHIP_ITEM}><ValueChip v={v} onOpen={() => onOpen(v)} disabled={!canEdit} warn="no category ticked" /></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
