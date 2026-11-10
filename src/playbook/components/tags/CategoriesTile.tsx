// Categories (Tags page): the list the AI reader picks from (it used to sit
// on Settings), each row "Uses: Colour, Work, Fabric" with how many of its
// products still lack a required value; tap → CategorySheet (link, reorder,
// unlink, remove). Add a category with the field at the bottom. A category
// whose products lack a value shows the review tint and the count.
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import type { AddToast } from '../PbToasts';
import type { TagsApi } from '../../data/tags';
import type { PbTaxonomy } from '../../tagTypes';
import { PB, pbInput, pbNum } from '../../pbTheme';
import { PbButton, PbRow, PbSection, PbTile } from '../ui';
import { Dot } from '../product/status';
import CategorySheet from './CategorySheet';
import { TagsEmpty } from './TagStates';
import { andList, attrNames, plural } from './tagText';

export default function CategoriesTile({ tax, api, addToast, onChanged, canEdit }: { tax: PbTaxonomy; api: TagsApi; addToast: AddToast; onChanged: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (next: string[], ok: string) => {
    setBusy(true);
    try { await api.saveCategories(next); addToast(ok, 'success'); onChanged(); return true; }
    catch (e) { addToast(friendlyError(e), 'error'); return false; } finally { setBusy(false); }
  };
  const add = async () => {
    const c = text.trim().replace(/\s+/g, ' ');
    if (!c || busy) return;
    if (tax.categories.some(x => x.toLowerCase() === c.toLowerCase())) { addToast(`${c} is already in the list.`, 'info'); return; }
    if (await save([...tax.categories, c], `Added ${c}`)) setText('');
  };
  const uses = (c: string) => attrNames(tax.links.filter(l => l.category.toLowerCase() === c.toLowerCase()).sort((a, b) => a.position - b.position).map(l => l.attribute_id), tax.attributes);
  const lacking = (c: string) => Math.max(0, ...tax.stats.filter(s => s.category.toLowerCase() === c.toLowerCase()).map(s => s.lacking));
  const count = (c: string) => tax.category_products.find(x => x.category.toLowerCase() === c.toLowerCase())?.products ?? 0;
  return (
    <PbTile as="section" aria-labelledby="pbt-cats">
      <PbSection title="Categories" id="pbt-cats" hint="The AI picks one for every product. Tap one to choose the attributes it needs — each one is a must before a product goes to websites.">
        {!tax.categories.length && <TagsEmpty icon="folder" title="No categories yet">Add the kinds of product you sell — Saree, Lehenga, Kurta Set.</TagsEmpty>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tax.categories.map(c => {
            const u = uses(c), lack = lacking(c);
            return (
              <li key={c}>
                <PbRow onClick={() => setOpen(c)} tone={lack ? 'review' : undefined} aria-label={`${c}: ${u.length ? `uses ${andList(u)}` : 'no attributes'}`}
                  title={c} meta={u.length ? `Uses: ${u.join(', ')}` : 'No attributes yet'}
                  status={<Dot color={lack ? PB.review : PB.live} label={lack ? `${plural(lack, 'product')} need a tag` : <><span style={pbNum}>{count(c).toLocaleString('en-IN')}</span> products</>} />} />
              </li>
            );
          })}
        </ul>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <label htmlFor="pbt-cat-add" className="pb-sr">New category</label>
            <input id="pbt-cat-add" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
              placeholder="e.g. Saree" maxLength={60} autoCapitalize="words" className="pb-input" style={{ ...pbInput, minWidth: 0 }} />
            <PbButton icon="plus" onClick={() => void add()} disabled={!text.trim()} busy={busy} busyLabel="Adding…" style={{ flexShrink: 0 }}>Add</PbButton>
          </div>
        )}
      </PbSection>
      <CategorySheet category={open} attrs={tax.attributes} links={tax.links} stats={tax.stats} api={api} addToast={addToast} canEdit={canEdit}
        onClose={() => setOpen(null)} onChanged={onChanged}
        onRemove={async c => { await save(tax.categories.filter(x => x !== c), `Removed ${c}`); }} />
    </PbTile>
  );
}
