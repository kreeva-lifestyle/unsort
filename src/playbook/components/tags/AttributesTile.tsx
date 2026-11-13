// Attributes and their values (Tags page): each attribute with "one value /
// several", its Shopify prefix, Edit, its values as chips (tap one → its
// sheet: name, also known as, merge, delete; the number is how many products
// carry it), and "+ Add value" with the live look-alike check. Long lists
// show the first 30 with "Show all". The empty state teaches the first step.
// An attribute whose values depend on the category (Product Type) shows them grouped by category (ScopedValues), and a
// value added to it opens its sheet at once, to tick its categories.
import { useState } from 'react';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbAttrValue, PbAttribute, PbCategoryLink } from '../../tagTypes';
import { PB, pbMeta, pbName, pbNum } from '../../pbTheme';
import { PbButton, PbSection, PbTile } from '../ui';
import AddValueField from './AddValueField';
import ScopedValues from './ScopedValues';
import { TagsEmpty } from './TagStates';
import ValueChip, { CHIP, CHIP_ITEM, CHIP_LIST } from './ValueChip';
import ValueSheet from './ValueSheet';
import { plural } from './tagText';

const SHOW = 30;

export default function AttributesTile({ attrs, categories, links, api, addToast, onChanged, onNew, onEdit, canEdit }: {
  attrs: PbAttribute[]; categories: string[]; links: PbCategoryLink[]; api: TagsApi; addToast: AddToast; onChanged: () => void;
  onNew: () => void; onEdit: (a: PbAttribute) => void; canEdit: boolean;
}) {
  const [open, setOpen] = useState<{ v: PbAttrValue; a: PbAttribute } | null>(null);
  const [all, setAll] = useState<Set<string>>(new Set());
  return (
    <PbTile as="section" aria-labelledby="pbt-attrs">
      <PbSection title="Attributes" id="pbt-attrs"
        hint="What the owner tags by: each attribute holds its own list of values. Playbook only ever picks from these lists — it never invents a tag.">
        {!attrs.length && (
          <TagsEmpty icon="layers" title="Create your first attribute, e.g. Colour"
            action={canEdit ? <PbButton icon="plus" onClick={onNew}>New attribute</PbButton> : undefined}>
            Then add its values — Black, Yellow, White — and link it to the categories that need it. Work (Embroidery, Printed) and Fabric come next.
          </TagsEmpty>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {attrs.map((a, i) => {
            const shown = all.has(a.id) ? a.values : a.values.slice(0, SHOW);
            return (
              <article key={a.id} aria-labelledby={`pbt-a-${a.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 0', borderTop: i ? `1px solid ${PB.tileBd}` : 'none', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 id={`pbt-a-${a.id}`} style={{ ...pbName, margin: 0, overflowWrap: 'anywhere' }}>{a.name}</h3>
                    <span style={pbMeta}>{a.multi ? 'Several values' : 'One value'}{a.by_category ? ' · Values depend on the category' : ''} · {plural(a.values.length, 'value')} · Shopify <span style={pbNum}>{(a.shopify_prefix || a.name)}_…</span></span>
                  </div>
                  {canEdit && <PbButton icon="edit" onClick={() => onEdit(a)} style={{ flexShrink: 0 }}>Edit</PbButton>}
                </div>
                {a.by_category ? <ScopedValues attr={a} categories={categories} links={links} onOpen={v => setOpen({ v, a })} canEdit={canEdit} />
                  : a.values.length > 0 ? (
                  <ul aria-label={`${a.name} values`} style={CHIP_LIST}>
                    {shown.map(v => <li key={v.id} style={CHIP_ITEM}><ValueChip v={v} onOpen={() => setOpen({ v, a })} disabled={!canEdit} /></li>)}
                    {a.values.length > SHOW && (
                      <li><button type="button" className="pb-pill" style={{ ...CHIP, color: PB.tx2 }} onClick={() => setAll(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
                        {all.has(a.id) ? 'Show fewer' : `Show all ${a.values.length}`}
                      </button></li>
                    )}
                  </ul>
                ) : <span style={{ ...pbMeta, color: PB.tx2 }}>No values yet — add the first one below.</span>}
                {canEdit && <AddValueField attr={a} attrs={attrs} api={api} addToast={addToast} onSaved={onChanged} onAdded={a.by_category ? v => setOpen({ v, a }) : undefined} />}
              </article>
            );
          })}
        </div>
      </PbSection>
      <ValueSheet value={open?.v ?? null} attr={open?.a ?? null} categories={categories} api={api} addToast={addToast} onClose={() => setOpen(null)} onSaved={onChanged} />
    </PbTile>
  );
}
