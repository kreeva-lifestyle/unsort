// Attributes and their values (Tags page): each attribute with "one value /
// several", its Shopify prefix, Edit, its values as chips (tap one → its
// sheet: name, also known as, merge, delete; the number is how many products
// carry it), and "+ Add value" with the live look-alike check. Long lists
// show the first 30 with "Show all". The empty state teaches the first step.
import { useState } from 'react';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbAttrValue, PbAttribute } from '../../tagTypes';
import { PB, pbBtnSecondary, pbMeta, pbName, pbNum } from '../../pbTheme';
import { PbButton, PbSection, PbTile } from '../ui';
import AddValueField from './AddValueField';
import { TagsEmpty } from './TagStates';
import ValueSheet from './ValueSheet';
import { plural } from './tagText';

const SHOW = 30;
const chip = { ...pbBtnSecondary, minHeight: 'var(--pb-chip-h)', padding: '4px 14px', borderRadius: PB.r.pill, fontWeight: 500, gap: 8, maxWidth: '100%', whiteSpace: 'normal', textAlign: 'left' } as const;

export default function AttributesTile({ attrs, api, addToast, onChanged, onNew, onEdit, canEdit }: {
  attrs: PbAttribute[]; api: TagsApi; addToast: AddToast; onChanged: () => void; onNew: () => void; onEdit: (a: PbAttribute) => void; canEdit: boolean;
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
                    <span style={pbMeta}>{a.multi ? 'Several values' : 'One value'} · {plural(a.values.length, 'value')} · Shopify <span style={pbNum}>{(a.shopify_prefix || a.name)}_…</span></span>
                  </div>
                  {canEdit && <PbButton icon="edit" onClick={() => onEdit(a)} style={{ flexShrink: 0 }}>Edit</PbButton>}
                </div>
                {a.values.length > 0 ? (
                  <ul aria-label={`${a.name} values`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {shown.map(v => (
                      <li key={v.id} style={{ minWidth: 0, maxWidth: '100%', display: 'flex' }}>
                        <button type="button" className="pb-pill" style={chip} onClick={() => setOpen({ v, a })} disabled={!canEdit}
                          aria-label={`${v.name}, ${plural(v.uses ?? 0, 'product')}${v.aliases.length ? `, also known as ${v.aliases.join(', ')}` : ''}`}>
                          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{v.name}</span>
                          {v.aliases.length > 0 && <span style={{ ...pbMeta, whiteSpace: 'nowrap' }}>+{v.aliases.length}</span>}
                          <span style={{ ...pbNum, ...pbMeta }}>{v.uses ?? 0}</span>
                        </button>
                      </li>
                    ))}
                    {a.values.length > SHOW && (
                      <li><button type="button" className="pb-pill" style={{ ...chip, color: PB.tx2 }} onClick={() => setAll(s => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
                        {all.has(a.id) ? 'Show fewer' : `Show all ${a.values.length}`}
                      </button></li>
                    )}
                  </ul>
                ) : <span style={{ ...pbMeta, color: PB.tx2 }}>No values yet — add the first one below.</span>}
                {canEdit && <AddValueField attr={a} attrs={attrs} api={api} addToast={addToast} onSaved={onChanged} />}
              </article>
            );
          })}
        </div>
      </PbSection>
      <ValueSheet value={open?.v ?? null} attr={open?.a ?? null} api={api} addToast={addToast} onClose={() => setOpen(null)} onSaved={onChanged} />
    </PbTile>
  );
}
